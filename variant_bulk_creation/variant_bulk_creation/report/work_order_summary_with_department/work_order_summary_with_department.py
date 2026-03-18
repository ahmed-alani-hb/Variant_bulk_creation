# Copyright (c) 2024, Custom and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	columns = get_columns()
	data = get_data(filters)
	return columns, data


def get_columns():
	return [
		{
			"fieldname": "work_order",
			"label": _("Work Order"),
			"fieldtype": "Link",
			"options": "Work Order",
			"width": 150
		},
		{
			"fieldname": "department",
			"label": _("Department"),
			"fieldtype": "Link",
			"options": "Department",
			"width": 120
		},
		{
			"fieldname": "status",
			"label": _("Status"),
			"fieldtype": "Data",
			"width": 100
		},
		{
			"fieldname": "production_item",
			"label": _("Production Item"),
			"fieldtype": "Link",
			"options": "Item",
			"width": 150
		},
		{
			"fieldname": "item_name",
			"label": _("Item Name"),
			"fieldtype": "Data",
			"width": 150
		},
		{
			"fieldname": "qty",
			"label": _("Qty to Manufacture"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "total_pcs",
			"label": _("Total Pieces to Manufacture"),
			"fieldtype": "Float",
			"width": 150
		},
		{
			"fieldname": "produced_qty",
			"label": _("Manufactured Qty"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "total_pcs_produced",
			"label": _("Total Pieces Produced"),
			"fieldtype": "Float",
			"width": 150
		},
		{
			"fieldname": "qty_variance",
			"label": _("Qty Variance"),
			"fieldtype": "Float",
			"width": 100
		},
		{
			"fieldname": "pcs_variance",
			"label": _("Pcs Variance"),
			"fieldtype": "Float",
			"width": 100
		},
		{
			"fieldname": "planned_start_date",
			"label": _("Planned Start Date"),
			"fieldtype": "Date",
			"width": 120
		},
		{
			"fieldname": "planned_end_date",
			"label": _("Planned End Date"),
			"fieldtype": "Date",
			"width": 120
		},
		{
			"fieldname": "actual_start_date",
			"label": _("Actual Start Date"),
			"fieldtype": "Datetime",
			"width": 140
		},
		{
			"fieldname": "actual_end_date",
			"label": _("Actual End Date"),
			"fieldtype": "Datetime",
			"width": 140
		},
		{
			"fieldname": "bom_no",
			"label": _("BOM"),
			"fieldtype": "Link",
			"options": "BOM",
			"width": 150
		},
		{
			"fieldname": "sales_order",
			"label": _("Sales Order"),
			"fieldtype": "Link",
			"options": "Sales Order",
			"width": 120
		}
	]


def get_data(filters):
	conditions = get_conditions(filters)

	data = frappe.db.sql(f"""
		SELECT
			wo.name as work_order,
			wo.department,
			wo.status,
			wo.production_item,
			item.item_name,
			wo.qty,
			wo.total_pcs,
			wo.produced_qty,
			wo.total_pcs_produced,
			(wo.qty - wo.produced_qty) as qty_variance,
			(wo.total_pcs - COALESCE(wo.total_pcs_produced, 0)) as pcs_variance,
			wo.planned_start_date,
			wo.planned_end_date,
			wo.actual_start_date,
			wo.actual_end_date,
			wo.bom_no,
			wo.sales_order
		FROM
			`tabWork Order` wo
		LEFT JOIN
			`tabItem` item ON wo.production_item = item.name
		WHERE
			wo.docstatus < 2
			{conditions}
		ORDER BY
			wo.planned_start_date DESC, wo.creation DESC
	""", filters, as_dict=1)

	return data


def get_conditions(filters):
	conditions = []

	if filters.get("company"):
		conditions.append("wo.company = %(company)s")

	if filters.get("from_date"):
		conditions.append("wo.planned_start_date >= %(from_date)s")

	if filters.get("to_date"):
		conditions.append("wo.planned_start_date <= %(to_date)s")

	if filters.get("department"):
		conditions.append("wo.department = %(department)s")

	if filters.get("status"):
		conditions.append("wo.status = %(status)s")

	if filters.get("production_item"):
		conditions.append("wo.production_item = %(production_item)s")

	return " AND " + " AND ".join(conditions) if conditions else ""
