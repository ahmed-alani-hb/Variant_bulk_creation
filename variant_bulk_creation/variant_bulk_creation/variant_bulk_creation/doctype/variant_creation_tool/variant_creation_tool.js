// SPDX-License-Identifier: MIT

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

        frm.set_query('attribute_value', 'variants', () => {
            if (!frm.doc.attribute_name) {
                return {};
            }
            return {
                filters: {
                    parent: frm.doc.attribute_name,
                    parenttype: 'Item Attribute'
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
            frm.clear_table('variants');
            frm.refresh_field('variants');
            return;
        }

        frappe.call({
            method: 'variant_bulk_creation.variant_bulk_creation.variant_bulk_creation.doctype.variant_creation_tool.variant_creation_tool.fetch_template_details',
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

                frm.clear_table('variants');
                frm.refresh_field('variants');
                frm.set_value('creation_log', '');
            }
        });
    }
});
