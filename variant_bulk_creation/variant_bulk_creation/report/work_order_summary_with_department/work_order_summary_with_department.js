// Copyright (c) 2024, Custom and contributors
// For license information, please see license.txt

frappe.query_reports["Work Order Summary with Department"] = {
	"filters": [
		{
			"fieldname": "company",
			"label": __("Company"),
			"fieldtype": "Link",
			"options": "Company",
			"default": frappe.defaults.get_user_default("Company"),
			"reqd": 1
		},
		{
			"fieldname": "from_date",
			"label": __("From Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1),
			"reqd": 1
		},
		{
			"fieldname": "to_date",
			"label": __("To Date"),
			"fieldtype": "Date",
			"default": frappe.datetime.get_today(),
			"reqd": 1
		},
		{
			"fieldname": "department",
			"label": __("Department"),
			"fieldtype": "Link",
			"options": "Department"
		},
		{
			"fieldname": "status",
			"label": __("Status"),
			"fieldtype": "Select",
			"options": "\nDraft\nNot Started\nIn Process\nCompleted\nStopped\nCancelled",
			"default": ""
		},
		{
			"fieldname": "production_item",
			"label": __("Production Item"),
			"fieldtype": "Link",
			"options": "Item"
		}
	]
};
