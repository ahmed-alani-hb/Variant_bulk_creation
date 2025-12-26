// SPDX-License-Identifier: MIT

const VBC_FETCH_TEMPLATE_METHOD =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.fetch_template_details';
const VBC_CREATE_VARIANT_METHOD =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.create_variant_for_sales_attributes';

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

const VBC_FIELD_MAP = {
    powder: 'vbc_powder_code',
    sticker: 'vbc_sticker',
    length: 'vbc_length'
};

const VBC_LINK_ATTRIBUTE_FIELDS = ['vbc_powder_code', 'vbc_sticker'];
const VBC_ATTRIBUTE_FIELDS = ['vbc_powder_code', 'vbc_sticker', 'vbc_length'];

function vbcClearAttributeFields(row) {
    VBC_ATTRIBUTE_FIELDS.forEach((field) => frappe.model.set_value(row.doctype, row.name, field, null));
}

function vbcTemplateFromRow(row) {
    return row.vbc_template_item || row.item_code || null;
}

function vbcMatchFieldForAttribute(attribute) {
    if (!attribute || !attribute.name) {
        return null;
    }

    const name = attribute.name.toLowerCase();
    if (name.includes('powder')) {
        return VBC_FIELD_MAP.powder;
    }
    if (name.includes('sticker')) {
        return VBC_FIELD_MAP.sticker;
    }
    if (name.includes('length')) {
        return VBC_FIELD_MAP.length;
    }

    return null;
}

function vbcSetAttributeQueries(frm) {
    VBC_LINK_ATTRIBUTE_FIELDS.forEach((fieldname) => {
        frm.set_query(fieldname, 'items', (doc, cdt, cdn) => {
            const row = locals[cdt][cdn];
            if (!row) {
                return {};
            }

            const template = vbcTemplateFromRow(row);
            if (!template) {
                return {};
            }

            const attributes = vbcGetTemplateAttributes(frm, template);
            if (!attributes || !attributes.length) {
                return {};
            }

            const attribute = attributes.find((attr) => vbcMatchFieldForAttribute(attr) === fieldname);
            if (!attribute) {
                return {};
            }

            return {
                query: 'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.search_attribute_values',
                filters: {
                    attribute: attribute.name
                }
            };
        });
    });
}

function vbcFetchAttributes(frm, template) {
    return frappe.call({
        method: VBC_FETCH_TEMPLATE_METHOD,
        args: { template_item: template },
        freeze: false
    });
}

function vbcMaybeCreateVariant(frm, cdt, cdn) {
    const row = locals[cdt][cdn];
    if (!row) {
        return;
    }

    const template = vbcTemplateFromRow(row);
    if (!template) {
        return;
    }

    const attributes = vbcGetTemplateAttributes(frm, template);
    if (!attributes || !attributes.length) {
        return;
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
                method: SALES_ORDER_RESOLVE_VARIANT,
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

frappe.ui.form.on('Sales Order', {
    setup(frm) {
        vbcSetAttributeQueries(frm);
        frm.set_query('vbc_template_item', 'items', () => ({
            filters: {
                has_variants: 1,
                variant_of: ['=', '']
            }
        }));
    }
});

frappe.ui.form.on('Sales Order Item', {
    item_code(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (!row) {
            return;
        }

        vbcClearAttributeFields(row);

        if (!row.item_code) {
            return;
        }

        vbcFetchAttributes(frm, row.item_code).then((response) => {
            if (!response.message) {
                return;
            }

            vbcCacheTemplateAttributes(frm, row.item_code, response.message.attributes || []);
            vbcSetAttributeQueries(frm);
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

frappe.ui.form.on('Sales Order Item', {
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

        vbcClearAttributeFields(row);

        if (row.sticker || row.powder_code || row.length != null) {
            frappe.model.set_value(cdt, cdn, {
                sticker: null,
                powder_code: null,
                length: null,
            });
        }

        vbcFetchAttributes(frm, row.vbc_template_item).then((response) => {
            if (!response.message) {
                return;
            }

            vbcCacheTemplateAttributes(frm, row.vbc_template_item, response.message.attributes || []);
            vbcSetAttributeQueries(frm);
        });
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

    vbc_powder_code(frm, cdt, cdn) {
        vbcMaybeCreateVariant(frm, cdt, cdn);
    },
    total_weight(frm, cdt, cdn) {
        calculateQtyFromTotalWeight(cdt, cdn);
    },
});

function calculateQtyFromTotalWeight(cdt, cdn) {
    const row = locals[cdt][cdn] || {};

    // Need total_weight and weight_per_unit to calculate
    if (!row.total_weight || !row.weight_per_unit) {
        return;
    }

    // weight_per_unit is in pcs/kg (pieces per kg)
    // total_weight is total number of pieces
    // Calculate weight in stock UOM (kg): weight_kg = total_weight / weight_per_unit
    const weight_per_unit = parseFloat(row.weight_per_unit);
    const total_weight = parseFloat(row.total_weight);

    if (weight_per_unit <= 0 || isNaN(weight_per_unit) || isNaN(total_weight)) {
        return;
    }

    // Calculate weight in base UOM (kg)
    const weight_in_kg = total_weight / weight_per_unit;

    // Get conversion factor (default to 1 if not set)
    const conversion_factor = parseFloat(row.conversion_factor) || 1;

    // Calculate quantity in transaction UOM
    // stock_qty = qty × conversion_factor
    // Therefore: qty = stock_qty / conversion_factor
    const calculated_qty = weight_in_kg / conversion_factor;

    // Set the calculated quantity
    frappe.model.set_value(cdt, cdn, 'qty', calculated_qty);
}
