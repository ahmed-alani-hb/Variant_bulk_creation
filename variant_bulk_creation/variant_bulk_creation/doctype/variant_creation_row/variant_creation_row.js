frappe.ui.form.on('Variant Creation Row', {
	attribute_value: function(frm, cdt, cdn) {
		calculate_weight(frm, cdt, cdn);
	},

	sticker_option: function(frm, cdt, cdn) {
		calculate_weight(frm, cdt, cdn);
	},

	weight_per_meter_with_sticker: function(frm, cdt, cdn) {
		calculate_weight(frm, cdt, cdn);
	},

	weight_per_meter_no_sticker: function(frm, cdt, cdn) {
		calculate_weight(frm, cdt, cdn);
	}
});

function calculate_weight(frm, cdt, cdn) {
	let row = locals[cdt][cdn];

	// Extract numeric length from attribute_value
	let length = extract_length_from_attribute(row.attribute_value);

	if (!length) {
		return;
	}

	// Get the appropriate kg/meter based on sticker option
	let kg_per_meter = 0;
	if (row.sticker_option === 'With Sticker' && row.weight_per_meter_with_sticker) {
		kg_per_meter = row.weight_per_meter_with_sticker;
	} else if (row.sticker_option === 'No Sticker' && row.weight_per_meter_no_sticker) {
		kg_per_meter = row.weight_per_meter_no_sticker;
	}

	if (kg_per_meter > 0) {
		// Calculate weight: length × kg/meter
		let calculated_weight = length * kg_per_meter;

		// Update the row
		frappe.model.set_value(cdt, cdn, 'calculated_weight_per_unit', calculated_weight);
		frappe.model.set_value(cdt, cdn, 'weight_uom', 'Nos');
	} else {
		// Clear the calculated weight if no valid kg/meter value
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
