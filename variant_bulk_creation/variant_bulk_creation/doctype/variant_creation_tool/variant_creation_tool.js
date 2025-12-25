// SPDX-License-Identifier: MIT

const FETCH_TEMPLATE_METHOD =
    'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.fetch_template_details';

function ensureAttributeCache(frm) {
    frm._variant_attribute_map = frm._variant_attribute_map || {};
}

function cacheTemplateAttribute(frm, template, attribute) {
    ensureAttributeCache(frm);
    frm._variant_attribute_map[template] = attribute;
}

function getTemplateAttribute(frm, template) {
    ensureAttributeCache(frm);
    return frm._variant_attribute_map[template] || null;
}

frappe.ui.form.on('Variant Creation Tool', {
    setup(frm) {
        frm.disable_save();
        frm.set_query('template_item', () => {
            return {
                filters: {
                    has_variants: 1,
                    variant_of: ['=', '']
                }
            };
        });

        frm.set_query('template_item', 'variants', () => {
            return {
                filters: {
                    has_variants: 1,
                    variant_of: ['=', '']
                }
            };
        });

        frm.set_query('attribute_value', 'variants', (doc, cdt, cdn) => {
            const row = locals[cdt][cdn];
            if (!row) {
                return {};
            }

            const template = row.template_item || doc.template_item;
            if (!template) {
                return {};
            }

            const attribute = getTemplateAttribute(frm, template);
            if (!attribute) {
                return {};
            }

            return {
                query: 'variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.search_attribute_values',
                filters: {
                    attribute
                }
            };
        });
    },

    refresh(frm) {
        frm.disable_save();
        frm.add_custom_button(__('Create Variants'), () => {
            frm.call({
                method: 'create_variants',
                doc: frm.doc,
                freeze: true,
                freeze_message: __('Creating Item Variants...'),
                callback: (response) => {
                    if (!response.message) {
                        return;
                    }
                    frm.set_value('creation_log', response.message.log || '');
                }
            });
        }, __('Actions'));
    },

    template_item(frm) {
        if (!frm.doc.template_item) {
            frm.set_value('attribute_name', null);
            frm.set_value('creation_log', '');
            frm.fields_dict.attribute_hint.$wrapper.html('');
            ensureAttributeCache(frm);
            frm.refresh_field('variants');
            return;
        }

        frappe.call({
            method: FETCH_TEMPLATE_METHOD,
            args: {
                template_item: frm.doc.template_item
            },
            freeze: true,
            freeze_message: __('Loading Template Details...'),
            callback: (response) => {
                if (!response.message) {
                    return;
                }

                frm.set_value('attribute_name', response.message.attribute);
                cacheTemplateAttribute(frm, frm.doc.template_item, response.message.attribute);

                const templateLabel = __('Template: {0}', [
                    frappe.utils.escape_html(response.message.template_name)
                ]);
                const attributeLabel = __('Attribute: {0}', [
                    frappe.utils.escape_html(response.message.attribute)
                ]);
                const valueList = response.message.value_labels
                    ? frappe.utils.escape_html(response.message.value_labels)
                    : '';

                const helperHtml = `
                    <div class="form-text">
                        <div>${templateLabel}</div>
                        <div>${attributeLabel}</div>
                        <div class="small text-muted">${__('Allowed Values')}: ${valueList}</div>
                    </div>`;
                frm.fields_dict.attribute_hint.$wrapper.html(helperHtml);
                frm.set_value('creation_log', '');

                (frm.doc.variants || []).forEach((row) => {
                    if (!row.template_item) {
                        frappe.model.set_value(row.doctype, row.name, 'attribute_value', null);
                        frappe.model.set_value(row.doctype, row.name, 'template_item', frm.doc.template_item);
                    }
                });

                frm.refresh_field('variants');

                // Fetch template Item to get kg/meter values
                fetchTemplateWeightConfig(frm, frm.doc.template_item);
            }
        });
    },

    variants_add(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (!row) {
            return;
        }

        if (frm.doc.template_item && !row.template_item) {
            frappe.model.set_value(cdt, cdn, 'template_item', frm.doc.template_item);
        }
    }
});

function fetchTemplateWeightConfig(frm, template_item) {
    if (!template_item) {
        return;
    }

    frappe.db.get_value('Item', template_item, ['weight_per_meter_with_sticker', 'weight_per_meter_no_sticker'])
        .then(r => {
            if (r.message) {
                // Cache weight config in form
                frm._weight_per_meter_with_sticker = r.message.weight_per_meter_with_sticker;
                frm._weight_per_meter_no_sticker = r.message.weight_per_meter_no_sticker;

                // Trigger recalculation for all variant rows
                recalculate_all_weights(frm);
            }
        });
}

function recalculate_all_weights(frm) {
    // Trigger recalculation for all variant rows
    (frm.doc.variants || []).forEach((row) => {
        if (row.attribute_value) {
            frappe.run_serially([
                () => frappe.model.trigger('attribute_value', row.doctype, row.name)
            ]);
        }
    });
}

frappe.ui.form.on('Variant Creation Row', {
    template_item(frm, cdt, cdn) {
        const row = locals[cdt][cdn];
        if (!row) {
            return;
        }

        if (!row.template_item && frm.doc.template_item) {
            frappe.model.set_value(cdt, cdn, 'template_item', frm.doc.template_item);
            return;
        }

        const template = row.template_item;
        if (!template) {
            frappe.model.set_value(cdt, cdn, 'attribute_value', null);
            return;
        }

        frappe.call({
            method: FETCH_TEMPLATE_METHOD,
            args: {
                template_item: template
            },
            callback: (response) => {
                if (!response.message) {
                    return;
                }

                cacheTemplateAttribute(frm, template, response.message.attribute);
                frappe.model.set_value(cdt, cdn, 'attribute_value', null);
            }
        });
    }
});
