// SPDX-License-Identifier: MIT

const VBC_FETCH_TEMPLATE_METHOD =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.fetch_template_details';
const VBC_RESOLVE_VARIANT_METHOD =
    'variant_bulk_creation.variant_bulk_creation.sales_order.resolve_sales_order_variant';
const VBC_ATTRIBUTE_QUERY =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.search_attribute_values';

/* ---------- template attribute cache ---------- */

function vbcEnsureTemplateCache(frm) {
    frm._vbc_template_cache = frm._vbc_template_cache || {};
}

function vbcCacheTemplateAttributes(frm, template, attributes) {
    vbcEnsureTemplateCache(frm);
    frm._vbc_template_cache[template] = attributes;
}

function vbcGetTemplateAttributes(frm, template) {
    vbcEnsureTemplateCache(frm);
    return frm._vbc_template_cache[template] || null;
}

function vbcFetchAndCacheAttributes(frm, template) {
    if (!template) {
        return Promise.resolve(null);
    }

    const cached = vbcGetTemplateAttributes(frm, template);
    if (cached) {
        return Promise.resolve(cached);
    }

    return frappe.call({
        method: VBC_FETCH_TEMPLATE_METHOD,
        args: { template_item: template },
        freeze: false,
    }).then((response) => {
        const attrs = (response && response.message && response.message.attributes) || [];
        vbcCacheTemplateAttributes(frm, template, attrs);
        return attrs;
    });
}

/* ---------- attribute → field mapping ---------- */

function vbcMatchFieldForAttribute(attribute) {
    if (!attribute || !attribute.name) {
        return null;
    }
    const name = attribute.name.toLowerCase();
    if (name.includes('powder')) return 'powder_code';
    if (name.includes('sticker')) return 'sticker';
    if (name.includes('length')) return 'length';
    return null;
}

/* ---------- grid column visibility ---------- */

function vbcSetupGridColumns(frm) {
    const visible_fields = [
        'template_item', 'item_code', 'qty', 'uom',
        'total_weight', 'rate', 'net_amount',
        'sticker', 'length', 'powder_code'
    ];

    const grid = frm.fields_dict.items && frm.fields_dict.items.grid;
    if (!grid) return;

    visible_fields.forEach((fieldname) => {
        grid.update_docfield_property(fieldname, 'in_list_view', 1);
    });

    grid.refresh();
}

/* ---------- variant resolution ---------- */

function vbcClearVariantFields(cdt, cdn) {
    frappe.model.set_value(cdt, cdn, {
        item_code: null,
        item_name: null,
        description: null,
        uom: null,
    });
}

function vbcApplyVariantDetails(frm, cdt, cdn, data) {
    // Set item_code — ERPNext will fetch item details including
    // weight_per_unit (which is set on the variant Item itself)
    const updates = {
        item_code: data.item_code,
        item_name: data.item_name,
        description: data.description,
    };
    if (data.stock_uom) {
        updates.uom = data.stock_uom;
        updates.stock_uom = data.stock_uom;
    }
    if (!frappe.model.get_value(cdt, cdn, 'conversion_factor')) {
        updates.conversion_factor = data.conversion_factor || 1;
    }

    frappe.model.set_value(cdt, cdn, updates);

    // Store weight_per_piece for total_weight → qty calculation
    const row = locals[cdt][cdn];
    if (row && data.weight_per_piece) {
        row._weight_per_piece = data.weight_per_piece;
    }
}

function vbcGetWeightPerPiece(row) {
    if (row._weight_per_piece) {
        return row._weight_per_piece;
    }
    // Derive from persisted weight_per_unit (pieces_per_kg) field
    if (row.weight_per_unit) {
        const wpp = 1 / row.weight_per_unit;
        row._weight_per_piece = wpp;
        return wpp;
    }
    return null;
}

function vbcRecalcQtyFromTotalWeight(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (!row || row._vbc_guard) return;

    const total_pcs = row.total_weight;
    const weight_per_piece = vbcGetWeightPerPiece(row);

    if (!total_pcs || !weight_per_piece) return;

    // total_weight = "total pcs" entered by user
    // qty (in Kg) = total_pcs * weight_per_piece (kg/piece)
    const qty = total_pcs * weight_per_piece;
    row._vbc_guard = true;
    row._vbc_total_pcs = total_pcs;

    frappe.model.set_value(cdt, cdn, 'qty', flt(qty, precision('qty', row)));

    // ERPNext's calculate_taxes_and_totals recalculates total_weight
    // asynchronously after qty changes. Force-restore the user's
    // entered total_pcs value after ERPNext finishes.
    setTimeout(() => {
        const r = locals[cdt] && locals[cdt][cdn];
        if (r && r._vbc_total_pcs) {
            frappe.model.set_value(cdt, cdn, 'total_weight', r._vbc_total_pcs).then(() => {
                if (r) r._vbc_guard = false;
            });
        } else {
            if (r) r._vbc_guard = false;
        }
    }, 500);
}

function vbcMaybeResolveVariant(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (!row) return;

    const template = row.template_item;
    if (!template) return;

    if (!row.powder_code || row.length == null || !row.sticker) {
        return;
    }

    vbcFetchAndCacheAttributes(frm, template).then(() => {
        frappe.call({
            method: VBC_RESOLVE_VARIANT_METHOD,
            args: {
                template_item: template,
                powder_code: row.powder_code,
                length: row.length,
                sticker: row.sticker,
            },
            freeze: false,
        }).then((response) => {
            if (response && response.message) {
                vbcApplyVariantDetails(frm, cdt, cdn, response.message);
            }
        });
    });
}

/* ---------- Sales Order form events ---------- */

frappe.ui.form.on('Sales Order', {
    setup(frm) {
        frm.set_query('template_item', 'items', () => ({
            filters: {
                has_variants: 1,
                variant_of: ['=', ''],
            },
        }));

        ['powder_code', 'sticker'].forEach((fieldname) => {
            frm.set_query(fieldname, 'items', (doc, cdt, cdn) => {
                const row = locals[cdt][cdn];
                if (!row || !row.template_item) return {};

                const attributes = vbcGetTemplateAttributes(frm, row.template_item);
                if (!attributes || !attributes.length) return {};

                const attr = attributes.find((a) => vbcMatchFieldForAttribute(a) === fieldname);
                if (!attr) return {};

                return {
                    query: VBC_ATTRIBUTE_QUERY,
                    filters: { attribute: attr.name },
                };
            });
        });
    },

    refresh(frm) {
        vbcSetupGridColumns(frm);
    },
});

/* ---------- Sales Order Item events ---------- */

frappe.ui.form.on('Sales Order Item', {
    template_item(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};

        frappe.model.set_value(cdt, cdn, {
            powder_code: null,
            sticker: null,
            length: null,
        });
        vbcClearVariantFields(cdt, cdn);

        if (!row.template_item) return;

        vbcFetchAndCacheAttributes(frm, row.template_item);
    },

    powder_code(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (!row.powder_code) {
            vbcClearVariantFields(cdt, cdn);
            return;
        }
        vbcMaybeResolveVariant(frm, cdt, cdn);
    },

    length(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (row.length == null) {
            vbcClearVariantFields(cdt, cdn);
            return;
        }
        vbcMaybeResolveVariant(frm, cdt, cdn);
    },

    sticker(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (!row.sticker) {
            vbcClearVariantFields(cdt, cdn);
            return;
        }
        vbcMaybeResolveVariant(frm, cdt, cdn);
    },

    total_weight(frm, cdt, cdn) {
        vbcRecalcQtyFromTotalWeight(frm, cdt, cdn);
    },
});
