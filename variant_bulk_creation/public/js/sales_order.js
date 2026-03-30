// SPDX-License-Identifier: MIT

const VBC_FETCH_TEMPLATE_METHOD =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.fetch_template_details';
const VBC_RESOLVE_VARIANT_METHOD =
    'variant_bulk_creation.variant_bulk_creation.sales_order.resolve_sales_order_variant';
const VBC_ATTRIBUTE_QUERY =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.search_attribute_values';

/* ---------- persistent total-pcs store ---------- */

/**
 * Store user-entered total_pcs values at form level so they survive
 * ERPNext's calculate_taxes_and_totals() which recalculates total_weight
 * for ALL rows (causing floating-point drift like 10 → 9.975).
 */
function vbcEnsurePcsStore(frm) {
    if (!frm._vbc_pcs_store) frm._vbc_pcs_store = {};
}

function vbcStorePcs(frm, cdn, value) {
    vbcEnsurePcsStore(frm);
    frm._vbc_pcs_store[cdn] = value;
}

function vbcGetStoredPcs(frm, cdn) {
    vbcEnsurePcsStore(frm);
    return frm._vbc_pcs_store[cdn];
}

/**
 * Restore all stored total_pcs values after ERPNext recalculation.
 * Called after calculate_taxes_and_totals overwrites total_weight.
 */
function vbcRestoreAllPcs(frm) {
    vbcEnsurePcsStore(frm);
    let net_weight_sum = 0;
    let any_restored = false;

    (frm.doc.items || []).forEach((row) => {
        const stored = frm._vbc_pcs_store[row.name];
        if (stored != null && row.total_weight !== stored) {
            row.total_weight = stored;
            any_restored = true;
        }
        net_weight_sum += flt(row.total_weight);
    });

    if (any_restored) {
        frm.doc.total_net_weight = net_weight_sum;
        frm.refresh_fields();
    }
}

/**
 * Monkey-patch calculate_taxes_and_totals so we can restore pcs
 * values after ERPNext finishes its recalculation.
 */
function vbcPatchCalculation(frm) {
    if (frm._vbc_calc_patched) return;
    frm._vbc_calc_patched = true;

    const orig = frm.cscript.calculate_taxes_and_totals;
    frm.cscript.calculate_taxes_and_totals = function() {
        if (orig) orig.apply(this, arguments);
        vbcRestoreAllPcs(frm);
    };
}

/**
 * On form load/refresh, initialise the pcs store from existing
 * total_weight values (which were saved correctly by before_save hook).
 */
function vbcInitPcsStoreFromDoc(frm) {
    vbcEnsurePcsStore(frm);
    (frm.doc.items || []).forEach((row) => {
        if (row.total_weight && !frm._vbc_pcs_store[row.name]) {
            frm._vbc_pcs_store[row.name] = row.total_weight;
        }
    });
}

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

    // Store the exact value the user entered
    vbcStorePcs(frm, cdn, total_pcs);

    // total_weight = "total pcs" entered by user
    // qty (in Kg) = total_pcs * weight_per_piece (kg/piece)
    const qty = total_pcs * weight_per_piece;
    row._vbc_guard = true;

    frappe.model.set_value(cdt, cdn, 'qty', flt(qty, precision('qty', row)));

    // ERPNext recalculates total_weight asynchronously after qty changes.
    // Force-restore the user's entered value after ERPNext finishes.
    setTimeout(() => {
        const r = locals[cdt] && locals[cdt][cdn];
        if (r) {
            const stored = vbcGetStoredPcs(frm, cdn);
            if (stored != null) {
                frappe.model.set_value(cdt, cdn, 'total_weight', stored).then(() => {
                    if (r) r._vbc_guard = false;
                });
            } else {
                r._vbc_guard = false;
            }
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
        vbcPatchCalculation(frm);

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
        vbcInitPcsStoreFromDoc(frm);
        vbcPatchCalculation(frm);
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
