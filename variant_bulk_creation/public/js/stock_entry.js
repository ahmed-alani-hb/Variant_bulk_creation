frappe.provide('variant_bulk_creation.stock_entry');

const STOCK_ENTRY_ATTRIBUTE_QUERY =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.search_attribute_values';
const STOCK_ENTRY_TEMPLATE_ATTRIBUTE =
    'variant_bulk_creation.variant_bulk_creation.sales_order.get_template_attribute';
const STOCK_ENTRY_RESOLVE_VARIANT =
    'variant_bulk_creation.variant_bulk_creation.stock_entry.resolve_stock_entry_variant';

function getVariantCache(frm) {
    frm.stock_entry_variant_cache = frm.stock_entry_variant_cache || {};
    return frm.stock_entry_variant_cache;
}

function fetchTemplateAttribute(frm, templateItem) {
    const cache = getVariantCache(frm);
    if (!templateItem) {
        return Promise.resolve(null);
    }

    if (cache[templateItem] && cache[templateItem].attribute) {
        return Promise.resolve(cache[templateItem]);
    }

    return frm
        .call({
            method: STOCK_ENTRY_TEMPLATE_ATTRIBUTE,
            args: { template_item: templateItem },
            freeze: false,
        })
        .then((response) => {
            cache[templateItem] = response?.message || {};
            return cache[templateItem];
        })
        .catch(() => null);
}

function clearVariantSelection(cdt, cdn) {
    frappe.model.set_value(cdt, cdn, {
        item_code: null,
        item_name: null,
        description: null,
        uom: null,
        stock_uom: null,
    });
}

function applyVariantDetails(cdt, cdn, data) {
    if (!data) {
        return;
    }

    const updates = {};

    if (data.item_code) {
        updates.item_code = data.item_code;
    }
    if (data.item_name) {
        updates.item_name = data.item_name;
    }
    if (data.description) {
        updates.description = data.description;
    }
    if (data.stock_uom) {
        updates.uom = data.stock_uom;
        updates.stock_uom = data.stock_uom;
    }
    if (data.conversion_factor) {
        updates.conversion_factor = data.conversion_factor;
    }

    if (Object.keys(updates).length) {
        frappe.model.set_value(cdt, cdn, updates);
    }
}

function ensureVariantForRow(frm, cdt, cdn) {
    const row = locals[cdt][cdn] || {};
    if (!row.template_item) {
        return;
    }

    // Require ALL three attributes to be provided before creating variant
    // Template + Powder Code + Length + Sticker must all be present
    const allAttributesSelected = row.powder_code && row.length != null && row.sticker;
    if (!allAttributesSelected) {
        return;
    }

    fetchTemplateAttribute(frm, row.template_item).then(() => {
        frm
            .call({
                method: STOCK_ENTRY_RESOLVE_VARIANT,
                args: {
                    template_item: row.template_item,
                    powder_code: row.powder_code,
                    length: row.length,
                    sticker: row.sticker,
                },
                freeze: false,
            })
            .then((response) => {
                if (response?.message) {
                    applyVariantDetails(cdt, cdn, response.message);
                }
            });
    });
}

frappe.ui.form.on('Stock Entry', {
    setup(frm) {
        getVariantCache(frm);

        frm.set_query('template_item', 'items', () => ({
            filters: { has_variants: 1 },
        }));

        frm.set_query('sticker', 'items', function (doc, cdt, cdn) {
            const row = locals[cdt][cdn] || {};
            if (!row.template_item) {
                return {};
            }

            return {
                query: STOCK_ENTRY_ATTRIBUTE_QUERY,
                filters: {
                    attribute: 'Sticker',
                },
            };
        });

        frm.set_query('powder_code', 'items', function (doc, cdt, cdn) {
            const row = locals[cdt][cdn] || {};
            if (!row.template_item) {
                return {};
            }

            return {
                query: STOCK_ENTRY_ATTRIBUTE_QUERY,
                filters: {
                    attribute: 'Powder Code',
                },
            };
        });
    },
});

frappe.ui.form.on('Stock Entry Detail', {
    template_item(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};

        if (!row.template_item) {
            frappe.model.set_value(cdt, cdn, {
                sticker: null,
                powder_code: null,
                length: null,
            });
            clearVariantSelection(cdt, cdn);
            return;
        }

        const cache = getVariantCache(frm);
        cache[row.template_item] = cache[row.template_item] || {};

        if (row.sticker || row.powder_code || row.length != null) {
            frappe.model.set_value(cdt, cdn, {
                sticker: null,
                powder_code: null,
                length: null,
            });
        }

        clearVariantSelection(cdt, cdn);

        fetchTemplateAttribute(frm, row.template_item);
    },
    powder_code(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (!row.powder_code) {
            clearVariantSelection(cdt, cdn);
            return;
        }

        ensureVariantForRow(frm, cdt, cdn);
    },
    length(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (row.length == null) {
            clearVariantSelection(cdt, cdn);
            return;
        }

        ensureVariantForRow(frm, cdt, cdn);
    },
    sticker(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (!row.sticker) {
            clearVariantSelection(cdt, cdn);
            return;
        }

        ensureVariantForRow(frm, cdt, cdn);
    },
    total_pcs(frm, cdt, cdn) {
        calculateQtyFromTotalPcs(cdt, cdn);
    },
});

function calculateQtyFromTotalPcs(cdt, cdn) {
    const row = locals[cdt][cdn] || {};

    // Need total_pcs and weight_per_unit to calculate
    if (!row.total_pcs || !row.item_code) {
        return;
    }

    // Get item details to fetch weight_per_unit
    frappe.call({
        method: 'frappe.client.get',
        args: {
            doctype: 'Item',
            name: row.item_code
        },
        callback: function(r) {
            if (r.message) {
                const item = r.message;
                const weight_per_unit = parseFloat(item.weight_per_unit);
                const total_pcs = parseFloat(row.total_pcs);

                if (!weight_per_unit || weight_per_unit <= 0 || isNaN(weight_per_unit) || isNaN(total_pcs)) {
                    return;
                }

                // weight_per_unit is in pcs/kg (pieces per kg)
                // total_pcs is total number of pieces
                // Calculate weight in base UOM (kg): weight_kg = total_pcs / weight_per_unit
                const weight_in_kg = total_pcs / weight_per_unit;

                // Get conversion factor (default to 1 if not set)
                const conversion_factor = parseFloat(row.conversion_factor) || 1;

                // Calculate quantity in transaction UOM
                // stock_qty = qty × conversion_factor
                // Therefore: qty = stock_qty / conversion_factor
                const calculated_qty = weight_in_kg / conversion_factor;

                // Set the calculated quantity
                frappe.model.set_value(cdt, cdn, 'qty', calculated_qty);
            }
        }
    });
}
