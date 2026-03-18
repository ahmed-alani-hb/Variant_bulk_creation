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
    if (name.includes('powder')) return 'vbc_powder_code';
    if (name.includes('sticker')) return 'vbc_sticker';
    if (name.includes('length')) return 'vbc_length';
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

    frappe.model.set_value(cdt, cdn, updates);

    // Store weight_per_piece on the row for total_pcs → qty calculation
    const row = locals[cdt][cdn];
    if (row && data.weight_per_piece) {
        row._weight_per_piece = data.weight_per_piece;
        // Recalculate qty from total_pcs if total_pcs is already set
        vbcRecalcQty(frm, cdt, cdn);
    }
}

function vbcRecalcQty(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (!row) return;

    const total_pcs = row.total_pcs;
    const weight_per_piece = row._weight_per_piece;

    if (total_pcs && weight_per_piece) {
        const qty = total_pcs * weight_per_piece;
        frappe.model.set_value(cdt, cdn, 'qty', flt(qty, precision('qty', row)));
    }
}

function vbcMaybeResolveVariant(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (!row) return;

    const template = row.vbc_template_item;
    if (!template) return;

    // All three attributes must be set
    if (!row.vbc_powder_code || row.vbc_length == null || !row.vbc_sticker) {
        return;
    }

    vbcFetchAndCacheAttributes(frm, template).then(() => {
        frappe.call({
            method: VBC_RESOLVE_VARIANT_METHOD,
            args: {
                template_item: template,
                powder_code: row.vbc_powder_code,
                length: row.vbc_length,
                sticker: row.vbc_sticker,
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
        frm.set_query('vbc_template_item', 'items', () => ({
            filters: {
                has_variants: 1,
                variant_of: ['=', ''],
            },
        }));

        // Powder code and sticker attribute queries
        ['vbc_powder_code', 'vbc_sticker'].forEach((fieldname) => {
            frm.set_query(fieldname, 'items', (doc, cdt, cdn) => {
                const row = locals[cdt][cdn];
                if (!row || !row.vbc_template_item) return {};

                const attributes = vbcGetTemplateAttributes(frm, row.vbc_template_item);
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
    vbc_template_item(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};

        // Clear attribute fields and variant selection when template changes
        frappe.model.set_value(cdt, cdn, {
            vbc_powder_code: null,
            vbc_sticker: null,
            vbc_length: null,
        });
        vbcClearVariantFields(cdt, cdn);

        if (!row.vbc_template_item) return;

        // Fetch and cache template attributes
        vbcFetchAndCacheAttributes(frm, row.vbc_template_item);
    },

    vbc_powder_code(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (!row.vbc_powder_code) {
            vbcClearVariantFields(cdt, cdn);
            return;
        }
        vbcMaybeResolveVariant(frm, cdt, cdn);
    },

    vbc_length(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (row.vbc_length == null) {
            vbcClearVariantFields(cdt, cdn);
            return;
        }
        vbcMaybeResolveVariant(frm, cdt, cdn);
    },

    vbc_sticker(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (!row.vbc_sticker) {
            vbcClearVariantFields(cdt, cdn);
            return;
        }
        vbcMaybeResolveVariant(frm, cdt, cdn);
    },

    total_pcs(frm, cdt, cdn) {
        vbcRecalcQty(frm, cdt, cdn);
    },
});
