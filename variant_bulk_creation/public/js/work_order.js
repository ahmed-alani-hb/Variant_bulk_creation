frappe.ui.form.on('Work Order', {
	total_pcs(frm) {
		calculateQtyFromTotalPcsHeader(frm);
	},
	qty(frm) {
		calculateTotalPcsFromQty(frm);
	},
	produced_qty(frm) {
		calculateTotalPcsProduced(frm);
	},
	total_pcs_produced(frm) {
		calculateProducedQtyFromTotalPcs(frm);
	},
	bom_no(frm) {
		// When BOM is selected, fetch total_pcs from BOM if available
		if (frm.doc.bom_no) {
			frappe.call({
				method: 'frappe.client.get',
				args: {
					doctype: 'BOM',
					name: frm.doc.bom_no
				},
				callback: function(r) {
					if (r.message && r.message.total_pcs) {
						frm.set_value('total_pcs', r.message.total_pcs);
					}
				}
			});
		}
	}
});

frappe.ui.form.on('Work Order Item', {
	total_pcs(frm, cdt, cdn) {
		calculateQtyFromTotalPcsRow(cdt, cdn);
	}
});

function calculateQtyFromTotalPcsHeader(frm) {
	if (!frm.doc.total_pcs || !frm.doc.production_item) {
		return;
	}

	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Item',
			name: frm.doc.production_item
		},
		callback: function(r) {
			if (r.message) {
				const item = r.message;
				const weight_per_unit = parseFloat(item.weight_per_unit);
				const total_pcs = parseFloat(frm.doc.total_pcs);

				if (weight_per_unit && weight_per_unit > 0 && !isNaN(total_pcs)) {
					const weight_in_kg = total_pcs / weight_per_unit;
					frm.set_value('qty', weight_in_kg);
				}
			}
		}
	});
}

function calculateTotalPcsFromQty(frm) {
	if (!frm.doc.qty || !frm.doc.production_item || frm.doc.total_pcs) {
		return; // Don't override if total_pcs is already set
	}

	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Item',
			name: frm.doc.production_item
		},
		callback: function(r) {
			if (r.message) {
				const item = r.message;
				const weight_per_unit = parseFloat(item.weight_per_unit);
				const qty = parseFloat(frm.doc.qty);

				if (weight_per_unit && weight_per_unit > 0 && !isNaN(qty)) {
					const total_pcs = qty * weight_per_unit;
					frm.set_value('total_pcs', total_pcs);
				}
			}
		}
	});
}

function calculateTotalPcsProduced(frm) {
	if (!frm.doc.produced_qty || !frm.doc.production_item || frm.doc.total_pcs_produced) {
		return; // Don't override if total_pcs_produced is already set
	}

	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Item',
			name: frm.doc.production_item
		},
		callback: function(r) {
			if (r.message) {
				const item = r.message;
				const weight_per_unit = parseFloat(item.weight_per_unit);
				const produced_qty = parseFloat(frm.doc.produced_qty);

				if (weight_per_unit && weight_per_unit > 0 && !isNaN(produced_qty)) {
					const total_pcs_produced = produced_qty * weight_per_unit;
					frm.set_value('total_pcs_produced', total_pcs_produced);
				}
			}
		}
	});
}

function calculateProducedQtyFromTotalPcs(frm) {
	if (!frm.doc.total_pcs_produced || !frm.doc.production_item) {
		return;
	}

	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Item',
			name: frm.doc.production_item
		},
		callback: function(r) {
			if (r.message) {
				const item = r.message;
				const weight_per_unit = parseFloat(item.weight_per_unit);
				const total_pcs_produced = parseFloat(frm.doc.total_pcs_produced);

				if (weight_per_unit && weight_per_unit > 0 && !isNaN(total_pcs_produced)) {
					const produced_qty = total_pcs_produced / weight_per_unit;
					frm.set_value('produced_qty', produced_qty);
				}
			}
		}
	});
}

function calculateQtyFromTotalPcsRow(cdt, cdn) {
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
				// stock_qty = qty × conversion_factor
				// Therefore: qty = stock_qty / conversion_factor
				const calculated_qty = weight_in_kg / conversion_factor;

				// Set the calculated quantity
				frappe.model.set_value(cdt, cdn, 'qty', calculated_qty);
			}
		}
	});
}
