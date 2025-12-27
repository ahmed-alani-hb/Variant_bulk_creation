frappe.ui.form.on('BOM Item', {
	total_pcs(frm, cdt, cdn) {
		calculateQtyFromTotalPcs(cdt, cdn);
	}
});

frappe.ui.form.on('BOM', {
	refresh(frm) {
		// Calculate total_pcs for the BOM based on finished good item
		if (frm.doc.item && frm.doc.quantity) {
			calculateBomTotalPcs(frm);
		}
	},
	quantity(frm) {
		calculateBomTotalPcs(frm);
	}
});

function calculateQtyFromTotalPcs(cdt, cdn) {
	const row = locals[cdt][cdn] || {};

	// Need total_pcs and weight_per_unit to calculate
	if (!row.total_pcs || !row.item_code) {
		return;
	}

	// Get item details to fetch weight_per_unit
	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Item',
			name: row.item_code
		},
		callback: function(r) {
			if (r.message) {
				const item = r.message;
				const weight_per_unit = parseFloat(item.weight_per_unit);
				const total_pcs = parseFloat(row.total_pcs);

				if (!weight_per_unit || weight_per_unit <= 0 || isNaN(weight_per_unit) || isNaN(total_pcs)) {
					return;
				}

				// weight_per_unit is in pcs/kg (pieces per kg)
				// total_pcs is total number of pieces
				// Calculate weight in base UOM (kg): weight_kg = total_pcs / weight_per_unit
				const weight_in_kg = total_pcs / weight_per_unit;

				// Get conversion factor (default to 1 if not set)
				const conversion_factor = parseFloat(row.conversion_factor) || 1;

				// Calculate quantity in transaction UOM
				const calculated_qty = weight_in_kg / conversion_factor;

				// Set the calculated quantity
				frappe.model.set_value(cdt, cdn, 'qty', calculated_qty);
			}
		}
	});
}

function calculateBomTotalPcs(frm) {
	// Get BOM finished good item's weight_per_unit
	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Item',
			name: frm.doc.item
		},
		callback: function(r) {
			if (r.message) {
				const item = r.message;
				const weight_per_unit = parseFloat(item.weight_per_unit);
				const quantity = parseFloat(frm.doc.quantity);

				if (weight_per_unit && weight_per_unit > 0 && quantity) {
					// Calculate total_pcs from quantity
					// qty = total_pcs / weight_per_unit
					// Therefore: total_pcs = qty × weight_per_unit
					const total_pcs = quantity * weight_per_unit;
					frm.set_value('total_pcs', total_pcs);
				}
			}
		}
	});
}
