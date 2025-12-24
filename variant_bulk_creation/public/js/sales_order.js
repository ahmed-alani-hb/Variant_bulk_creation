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

function vbcAttributeFieldnames() {
    return ['vbc_attribute_value_1', 'vbc_attribute_value_2', 'vbc_attribute_value_3'];
}

function vbcClearAttributeFields(row) {
    vbcAttributeFieldnames().forEach((field) => frappe.model.set_value(row.doctype, row.name, field, null));
}

function vbcSetAttributeQueries(frm) {
    vbcAttributeFieldnames().forEach((fieldname, index) => {
        frm.set_query(fieldname, 'items', (doc, cdt, cdn) => {
            const row = locals[cdt][cdn];
            if (!row || !row.item_code) {
                return {};
            }

            const attributes = vbcGetTemplateAttributes(frm, row.item_code);
            const attribute = attributes && attributes[index] ? attributes[index] : null;
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
    if (!row || !row.item_code) {
        return;
    }

    const attributes = vbcGetTemplateAttributes(frm, row.item_code);
    if (!attributes || !attributes.length) {
        return;
    }

    const fieldnames = vbcAttributeFieldnames();
    const missing = attributes.filter((_, idx) => !row[fieldnames[idx]]);
    if (missing.length) {
        return;
    }

    frappe.call({
        method: VBC_CREATE_VARIANT_METHOD,
        args: {
            template_item: row.item_code,
            attributes: {
                vbc_attribute_value_1: row.vbc_attribute_value_1,
                vbc_attribute_value_2: row.vbc_attribute_value_2,
                vbc_attribute_value_3: row.vbc_attribute_value_3
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

    vbc_attribute_value_1(frm, cdt, cdn) {
        vbcMaybeCreateVariant(frm, cdt, cdn);
    },

    vbc_attribute_value_2(frm, cdt, cdn) {
        vbcMaybeCreateVariant(frm, cdt, cdn);
    },

    vbc_attribute_value_3(frm, cdt, cdn) {
        vbcMaybeCreateVariant(frm, cdt, cdn);
    }
});
