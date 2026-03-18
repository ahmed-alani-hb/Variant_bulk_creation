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

    // Set weight_per_unit so ERPNext can compute total_weight correctly
    if (data.weight_per_piece) {
        updates.weight_per_unit = data.weight_per_piece;
        updates.weight_uom = 'Kg';
    }

    frappe.model.set_value(cdt, cdn, updates);

    // Store weight_per_piece on the row for total_weight → qty calculation
    const row = locals[cdt][cdn];
    if (row && data.weight_per_piece) {
        row._weight_per_piece = data.weight_per_piece;
        // Recalculate qty from total_weight if total_weight is already set
        vbcRecalcQtyFromTotalWeight(frm, cdt, cdn);
    }
}

function vbcRecalcQtyFromTotalWeight(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (!row) return;

    const total_weight = row.total_weight;
    const weight_per_piece = row._weight_per_piece;

    if (total_weight && weight_per_piece) {
        // total_weight is used as "total pcs"
        // qty (in Kg) = total_pcs * weight_per_piece (kg per piece)
        const qty = total_weight * weight_per_piece;
        frappe.model.set_value(cdt, cdn, 'qty', flt(qty, precision('qty', row)));
    }
}

function vbcMaybeResolveVariant(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (!row) return;

    const template = row.template_item;
    if (!template) return;

    // All three attributes must be set
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
        // Template field query: only show template items
        frm.set_query('template_item', 'items', () => ({
            filters: {
                has_variants: 1,
                variant_of: ['=', ''],
            },
        }));

        // Powder code and sticker attribute queries
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
});

/* ---------- Sales Order Item events ---------- */

frappe.ui.form.on('Sales Order Item', {
    template_item(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};

        // Clear attribute fields and variant selection when template changes
        frappe.model.set_value(cdt, cdn, {
            powder_code: null,
            sticker: null,
            length: null,
        });
        vbcClearVariantFields(cdt, cdn);

        if (!row.template_item) return;

        // Fetch and cache template attributes
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
