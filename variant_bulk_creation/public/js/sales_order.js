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

    const missing = attributes.filter((attribute) => {
        const fieldname = vbcMatchFieldForAttribute(attribute);
        return fieldname && !row[fieldname];
    });
    if (missing.length) {
        return;
    }

    frappe.call({
        method: VBC_CREATE_VARIANT_METHOD,
        args: {
            template_item: template,
            attributes: {
                vbc_powder_code: row.vbc_powder_code,
                vbc_sticker: row.vbc_sticker,
                vbc_length: row.vbc_length
            }
        },
        freeze: true,
        freeze_message: __('Creating variant from Sales Order row...'),
        callback: (response) => {
            if (!response.message) {
                return;
            }

            const { item_code, item_name, description } = response.message;
            frappe.model.set_value(cdt, cdn, 'item_code', item_code);
            if (item_name) {
                frappe.model.set_value(cdt, cdn, 'item_name', item_name);
            }
            if (description) {
                frappe.model.set_value(cdt, cdn, 'description', description);
            }
        }
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
    },

    vbc_template_item(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (!row) {
            return;
        }

        vbcClearAttributeFields(row);

        if (!row.vbc_template_item) {
            return;
        }

        vbcFetchAttributes(frm, row.vbc_template_item).then((response) => {
            if (!response.message) {
                return;
            }

            vbcCacheTemplateAttributes(frm, row.vbc_template_item, response.message.attributes || []);
            vbcSetAttributeQueries(frm);
        });
    },

    vbc_powder_code(frm, cdt, cdn) {
        vbcMaybeCreateVariant(frm, cdt, cdn);
    },

    vbc_sticker(frm, cdt, cdn) {
        vbcMaybeCreateVariant(frm, cdt, cdn);
    },

    vbc_length(frm, cdt, cdn) {
        vbcMaybeCreateVariant(frm, cdt, cdn);
    }
});
