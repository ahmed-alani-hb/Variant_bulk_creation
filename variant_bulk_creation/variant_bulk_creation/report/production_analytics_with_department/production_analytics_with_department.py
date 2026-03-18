# Copyright (c) 2024, Custom and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def execute(filters=None):
	if not filters:
		filters = {}

	columns = get_columns(filters)
	data = get_data(filters)
	chart = get_chart_data(data, filters)

	return columns, data, None, chart


def get_columns(filters):
	group_by = filters.get("group_by", "Department")

	columns = []

	if group_by == "Department":
		columns.append({
			"fieldname": "department",
			"label": _("Department"),
			"fieldtype": "Link",
			"options": "Department",
			"width": 150
		})
	elif group_by == "Production Item":
		columns.extend([
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
			}
		])
	elif group_by == "Status":
		columns.append({
			"fieldname": "status",
			"label": _("Status"),
			"fieldtype": "Data",
			"width": 120
		})

	columns.extend([
		{
			"fieldname": "total_work_orders",
			"label": _("Total Work Orders"),
			"fieldtype": "Int",
			"width": 130
		},
		{
			"fieldname": "planned_qty",
			"label": _("Planned Qty"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "planned_pcs",
			"label": _("Planned Pieces"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "produced_qty",
			"label": _("Produced Qty"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "produced_pcs",
			"label": _("Produced Pieces"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "qty_variance",
			"label": _("Qty Variance"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "pcs_variance",
			"label": _("Pcs Variance"),
			"fieldtype": "Float",
			"width": 120
		},
		{
			"fieldname": "efficiency",
			"label": _("Efficiency %"),
			"fieldtype": "Percent",
			"width": 100
		},
		{
			"fieldname": "completed_orders",
			"label": _("Completed Orders"),
			"fieldtype": "Int",
			"width": 130
		},
		{
			"fieldname": "in_process_orders",
			"label": _("In Process Orders"),
			"fieldtype": "Int",
			"width": 130
		},
		{
			"fieldname": "not_started_orders",
			"label": _("Not Started Orders"),
			"fieldtype": "Int",
			"width": 140
		}
	])

	return columns


def get_data(filters):
	group_by = filters.get("group_by", "Department")
	conditions = get_conditions(filters)

	# Determine the grouping field
	if group_by == "Department":
		group_field = "wo.department"
		select_field = "wo.department"
	elif group_by == "Production Item":
		group_field = "wo.production_item"
		select_field = "wo.production_item, item.item_name"
	elif group_by == "Status":
		group_field = "wo.status"
		select_field = "wo.status"
	else:
		group_field = "wo.department"
		select_field = "wo.department"

	data = frappe.db.sql(f"""
		SELECT
			{select_field},
			COUNT(*) as total_work_orders,
			SUM(wo.qty) as planned_qty,
			SUM(COALESCE(wo.total_pcs, 0)) as planned_pcs,
			SUM(wo.produced_qty) as produced_qty,
			SUM(COALESCE(wo.total_pcs_produced, 0)) as produced_pcs,
			SUM(wo.qty - wo.produced_qty) as qty_variance,
			SUM(COALESCE(wo.total_pcs, 0) - COALESCE(wo.total_pcs_produced, 0)) as pcs_variance,
			CASE
				WHEN SUM(wo.qty) > 0 THEN (SUM(wo.produced_qty) / SUM(wo.qty)) * 100
				ELSE 0
			END as efficiency,
			SUM(CASE WHEN wo.status = 'Completed' THEN 1 ELSE 0 END) as completed_orders,
			SUM(CASE WHEN wo.status = 'In Process' THEN 1 ELSE 0 END) as in_process_orders,
			SUM(CASE WHEN wo.status = 'Not Started' THEN 1 ELSE 0 END) as not_started_orders
		FROM
			`tabWork Order` wo
		LEFT JOIN
			`tabItem` item ON wo.production_item = item.name
		WHERE
			wo.docstatus < 2
			{conditions}
		GROUP BY
			{group_field}
		ORDER BY
			planned_qty DESC
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

	if filters.get("production_item"):
		conditions.append("wo.production_item = %(production_item)s")

	return " AND " + " AND ".join(conditions) if conditions else ""


def get_chart_data(data, filters):
	if not data:
		return None

	group_by = filters.get("group_by", "Department")

	labels = []
	planned_qty = []
	produced_qty = []

	for row in data:
		if group_by == "Department":
			labels.append(row.get("department") or "No Department")
		elif group_by == "Production Item":
			labels.append(row.get("production_item") or "Unknown")
		elif group_by == "Status":
			labels.append(row.get("status") or "Unknown")

		planned_qty.append(row.get("planned_qty", 0))
		produced_qty.append(row.get("produced_qty", 0))

	chart = {
		"data": {
			"labels": labels,
			"datasets": [
				{
					"name": "Planned Qty",
					"values": planned_qty
				},
				{
					"name": "Produced Qty",
					"values": produced_qty
				}
			]
		},
		"type": "bar",
		"colors": ["#7cd6fd", "#5e64ff"]
	}

	return chart
