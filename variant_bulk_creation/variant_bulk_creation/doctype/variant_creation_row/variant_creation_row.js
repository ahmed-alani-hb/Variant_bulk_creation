frappe.ui.form.on('Variant Creation Row', {
	attribute_value: function(frm, cdt, cdn) {
		calculate_weight_preview(frm, cdt, cdn);
	}
});

function calculate_weight_preview(frm, cdt, cdn) {
	let row = locals[cdt][cdn];

	// Get kg/meter values from parent form
	let weight_per_meter_with_sticker = frm.doc.weight_per_meter_with_sticker;
	let weight_per_meter_no_sticker = frm.doc.weight_per_meter_no_sticker;

	if (!weight_per_meter_with_sticker && !weight_per_meter_no_sticker) {
		// No weight configuration, skip calculation
		return;
	}

	// Extract numeric length from attribute_value
	let length = extract_length_from_attribute(row.attribute_value);

	if (!length) {
		frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', 0);
		frappe.model.set_value(cdt, cdn, 'weight_uom', '');
		return;
	}

	// Check if attribute_value contains sticker information
	let attribute_lower = row.attribute_value.toLowerCase();
	let kg_per_meter = 0;

	if (attribute_lower.includes('sticker') && !attribute_lower.includes('no')) {
		// Contains "sticker" but not "no sticker"
		kg_per_meter = weight_per_meter_with_sticker || 0;
	} else if (attribute_lower.includes('no') && attribute_lower.includes('sticker')) {
		// Contains "no sticker"
		kg_per_meter = weight_per_meter_no_sticker || 0;
	} else {
		// Default to no sticker
		kg_per_meter = weight_per_meter_no_sticker || 0;
	}

	if (kg_per_meter > 0) {
		// Calculate weight: length × kg/meter
		let calculated_weight = length * kg_per_meter;

		// Update the row (preview only, actual calculation happens server-side)
		frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', calculated_weight);
		frappe.model.set_value(cdt, cdn, 'weight_uom', 'Nos');
	} else {
		frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', 0);
		frappe.model.set_value(cdt, cdn, 'weight_uom', '');
	}
}

function extract_length_from_attribute(attribute_value) {
	if (!attribute_value) {
		return null;
	}

	// Try to extract numeric value from the attribute
	// Handles cases like "6", "6m", "6 meter", "6.5", "6.5m", etc.
	let match = attribute_value.toString().match(/(\d+\.?\d*)/);

	if (match) {
		return parseFloat(match[1]);
	}

	return null;
}
