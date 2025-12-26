frappe.ui.form.on('Variant Creation Row', {
	attribute_value: function(frm, cdt, cdn) {
		calculate_weight_preview(frm, cdt, cdn);
	},

	attribute_value_2: function(frm, cdt, cdn) {
		calculate_weight_preview(frm, cdt, cdn);
	},

	attribute_value_3: function(frm, cdt, cdn) {
		calculate_weight_preview(frm, cdt, cdn);
	}
});

function calculate_weight_preview(frm, cdt, cdn) {
	let row = locals[cdt][cdn];

	// Get kg/meter values from cached form properties (loaded from template Item)
	let weight_per_meter_with_sticker = frm._weight_per_meter_with_sticker;
	let weight_per_meter_no_sticker = frm._weight_per_meter_no_sticker;

	if (!weight_per_meter_with_sticker && !weight_per_meter_no_sticker) {
		// No weight configuration, skip calculation
		return;
	}

	// Extract numeric length from any attribute value
	let length = extract_length_from_attributes(row);

	if (!length) {
		frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', 0);
		frappe.model.set_value(cdt, cdn, 'weight_uom', '');
		return;
	}

	// Determine sticker option from attributes
	let has_sticker = check_sticker_from_attributes(row);
	let kg_per_meter = 0;

	if (has_sticker && weight_per_meter_with_sticker) {
		kg_per_meter = weight_per_meter_with_sticker;
	} else if (!has_sticker && weight_per_meter_no_sticker) {
		kg_per_meter = weight_per_meter_no_sticker;
	} else {
		// Default to no sticker
		kg_per_meter = weight_per_meter_no_sticker || 0;
	}

	if (kg_per_meter > 0) {
		// Calculate weight: length × kg/meter
		let calculated_weight = length * kg_per_meter;

		// Update the row (preview only, actual calculation happens server-side)
		frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', calculated_weight);
		frappe.model.set_value(cdt, cdn, 'weight_uom', 'pcs');
	} else {
		frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', 0);
		frappe.model.set_value(cdt, cdn, 'weight_uom', '');
	}
}

function extract_length_from_attributes(row) {
	// Try to extract length from any attribute value
	let attributes = [row.attribute_value, row.attribute_value_2, row.attribute_value_3];

	for (let attr of attributes) {
		if (!attr) continue;

		let length = extract_numeric_value(attr);
		if (length) return length;
	}

	return null;
}

function check_sticker_from_attributes(row) {
	// Check if any attribute indicates "with sticker"
	let attributes = [row.attribute_value, row.attribute_value_2, row.attribute_value_3];

	for (let attr of attributes) {
		if (!attr) continue;

		let attr_lower = attr.toLowerCase();
		if (attr_lower.includes('sticker') && !attr_lower.includes('no')) {
			return true;
		} else if (attr_lower.includes('no') && attr_lower.includes('sticker')) {
			return false;
		}
	}

	// Default to no sticker
	return false;
}

function extract_numeric_value(attribute_value) {
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
