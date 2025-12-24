frappe.provide('variant_bulk_creation.sales_order');

const SALES_ORDER_ATTRIBUTE_QUERY =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.search_attribute_values';
const SALES_ORDER_TEMPLATE_ATTRIBUTE =
    'variant_bulk_creation.variant_bulk_creation.sales_order.get_template_attribute';
const SALES_ORDER_RESOLVE_VARIANT =
    'variant_bulk_creation.variant_bulk_creation.sales_order.resolve_sales_order_variant';

function getVariantCache(frm) {
    frm.sales_order_variant_cache = frm.sales_order_variant_cache || {};
    return frm.sales_order_variant_cache;
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
            method: SALES_ORDER_TEMPLATE_ATTRIBUTE,
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
    if (!row.template_item || !row.attribute_value) {
        return;
    }

    fetchTemplateAttribute(frm, row.template_item).then(() => {
        frm
            .call({
                method: SALES_ORDER_RESOLVE_VARIANT,
                args: {
                    template_item: row.template_item,
                    attribute_value: row.attribute_value,
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

frappe.ui.form.on('Sales Order', {
    setup(frm) {
        getVariantCache(frm);

        frm.set_query('template_item', 'items', () => ({
            filters: { has_variants: 1 },
        }));

        frm.set_query('attribute_value', 'items', function (doc, cdt, cdn) {
            const row = locals[cdt][cdn] || {};
            if (!row.template_item) {
                return {};
            }

            const cache = getVariantCache(frm)[row.template_item];
            if (!cache || !cache.attribute) {
                return {};
            }

            return {
                query: SALES_ORDER_ATTRIBUTE_QUERY,
                filters: {
                    attribute: cache.attribute,
                },
            };
        });

        frm.set_query('sticker', 'items', function (doc, cdt, cdn) {
            const row = locals[cdt][cdn] || {};
            if (!row.template_item) {
                return {};
            }

            return {
                query: SALES_ORDER_ATTRIBUTE_QUERY,
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
                query: SALES_ORDER_ATTRIBUTE_QUERY,
                filters: {
                    attribute: 'Powder Code',
                },
            };
        });
    },
});

frappe.ui.form.on('Sales Order Item', {
    template_item(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};

        if (!row.template_item) {
            frappe.model.set_value(cdt, cdn, {
                attribute_value: null,
            });
            clearVariantSelection(cdt, cdn);
            return;
        }

        const cache = getVariantCache(frm);
        cache[row.template_item] = cache[row.template_item] || {};

        if (row.attribute_value) {
            frappe.model.set_value(cdt, cdn, {
                attribute_value: null,
            });
        }

        clearVariantSelection(cdt, cdn);

        fetchTemplateAttribute(frm, row.template_item);
    },
    attribute_value(frm, cdt, cdn) {
        const row = locals[cdt][cdn] || {};
        if (!row.attribute_value) {
            clearVariantSelection(cdt, cdn);
            return;
        }

        ensureVariantForRow(frm, cdt, cdn);
    },
});
