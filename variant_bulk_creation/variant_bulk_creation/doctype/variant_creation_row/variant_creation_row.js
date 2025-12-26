frappe.ui.form.on('Variant Creation Row', {
	template_item: function(frm, cdt, cdn) {
		calculate_weight_preview(frm, cdt, cdn);
	},

	attribute_value: function(frm, cdt, cdn) {
		calculate_weight_preview(frm, cdt, cdn);
	}
});

function calculate_weight_preview(frm, cdt, cdn) {
	let row = locals[cdt][cdn];

	if (!row.template_item || !row.attribute_value) {
		frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', null);
		frappe.model.set_value(cdt, cdn, 'weight_uom', null);
		return;
	}

	// Fetch template details to get weight per meter values
	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Item',
			name: row.template_item
		},
		callback: function(r) {
			if (r.message) {
				let template = r.message;
				let length = extract_length_from_attribute(row.attribute_value);

				if (!length) {
					frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', null);
					frappe.model.set_value(cdt, cdn, 'weight_uom', null);
					return;
				}

				// Determine if variant has sticker by checking attribute value
				let has_sticker = detect_sticker_from_attribute(row.attribute_value);

				// Select appropriate kg/meter value
				let kg_per_meter = has_sticker ?
					template.weight_per_meter_with_sticker :
					template.weight_per_meter_no_sticker;

				if (kg_per_meter) {
					// Calculate pieces per kg (inverse calculation)
					// weight_per_piece = length × kg/meter
					// pieces_per_kg = 1 / weight_per_piece
					let weight_per_piece = length * kg_per_meter;
					if (weight_per_piece > 0) {
						let pieces_per_kg = 1 / weight_per_piece;
						frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', pieces_per_kg);
						frappe.model.set_value(cdt, cdn, 'weight_uom', 'pcs');
					} else {
						frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', null);
						frappe.model.set_value(cdt, cdn, 'weight_uom', null);
					}
				} else {
					frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', null);
					frappe.model.set_value(cdt, cdn, 'weight_uom', null);
				}
			}
		}
	});
}

function extract_length_from_attribute(attribute_value) {
	if (!attribute_value) return null;

	// Extract numeric value from attribute (e.g., "6m" -> 6.0, "6.5m" -> 6.5)
	let match = attribute_value.toString().match(/(\d+\.?\d*)/);
	if (match) {
		return parseFloat(match[1]);
	}
	return null;
}

function detect_sticker_from_attribute(attribute_value) {
	if (!attribute_value) return false;

	// Any value except "No sticker" means the variant has a sticker
	let attr_lower = attribute_value.toString().trim().toLowerCase();
	return attr_lower !== 'no sticker';
}
