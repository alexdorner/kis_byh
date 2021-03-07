// Copyright (c) 2016, ESS LLP and contributors
// For license information, please see license.txt
//frappe.provide('erpnext.queries');
frappe.ui.form.on('Patient Appointment', {
	setup: function(frm) {
		frm.custom_make_buttons = {

			'Patient Encounter': 'Patient Encounter'
		};
	},

	onload: function(frm) {
		if (frm.is_new()) {
			frm.set_value('appointment_time', null);
			frm.disable_save();
		}
	},

	refresh: function(frm) {
		frm.set_query('patient', function () {
			return {
				filters: {'patient': frm.doc.patient}
			};
		});

		frm.set_query('practitioner', function() {
			return {
				filters: {
					'department': frm.doc.department
				}
			};
		});

		frm.set_query('service_unit', function(){
			return {
				filters: {
					'is_group': false,
					'allow_appointments': true,
					'company': frm.doc.company
				}
			};
		});



		if (frm.is_new()) {
			frm.page.set_primary_action(__('Check Availability'), function() {
				if (!frm.doc.patient) {
					frappe.msgprint({
						title: __('Not Allowed'),
						message: __('Please select Patient first'),
						indicator: 'red'
					});

							} else {
								check_and_set_availability(frm);
							}

			});
		} else {
			frm.page.set_primary_action(__('Save'), () => frm.save());
		}



		if (frm.doc.status == 'Open' || (frm.doc.status == 'Scheduled' && !frm.doc.__islocal)) {
			frm.add_custom_button(__('Cancel'), function () {
				update_status(frm, 'Cancelled');
			});
			frm.add_custom_button(__('Reschedule'), function () {
				check_and_set_availability(frm);
			});


			frm.add_custom_button(__('Patient Encounter'), function () {
				frappe.model.open_mapped_doc({
					method: 'kis.kis.doctype.patient_appointment.patient_appointment.make_encounter',
					frm: frm,
				});
			}, __('Create'));
		}


	}





});

let check_and_set_availability = function(frm) {
	let selected_slot = null;
	let service_unit = null;
	let duration = null;

	show_availability();

	function show_empty_state(practitioner, appointment_date) {
		frappe.msgprint({
			title: __('Not Available'),
			message: __('kis Practitioner {0} not available on {1}', [practitioner.bold(), appointment_date.bold()]),
			indicator: 'red'
		});
	}

	function show_availability() {
		let selected_practitioner = '';
		let d = new frappe.ui.Dialog({
			title: __('Available slots'),
			fields: [
				{ fieldtype: 'Link', options: 'Medical Department', reqd: 1, fieldname: 'department', label: 'Medical Department'},
				{ fieldtype: 'Column Break'},
				{ fieldtype: 'Link', options: 'KIS Practitioner', reqd: 1, fieldname: 'practitioner', label: 'KIS Practitioner'},
				{ fieldtype: 'Column Break'},
				{ fieldtype: 'Date', reqd: 1, fieldname: 'appointment_date', label: 'Date'},
				{ fieldtype: 'Section Break'},
				{ fieldtype: 'HTML', fieldname: 'available_slots'}

			],
			primary_action_label: __('Book'),
			primary_action: function() {
				frm.set_value('appointment_time', selected_slot);
				if (!frm.doc.duration) {
					frm.set_value('duration', duration);
				}
				frm.set_value('practitioner', d.get_value('practitioner'));
				frm.set_value('department', d.get_value('department'));
				frm.set_value('appointment_date', d.get_value('appointment_date'));
				if (service_unit) {
					frm.set_value('service_unit', service_unit);
				}
				d.hide();
				frm.enable_save();
				frm.save();
				d.get_primary_btn().attr('disabled', true);
			}
		});

		d.set_values({
			'department': frm.doc.department,
			'practitioner': frm.doc.practitioner,
			'appointment_date': frm.doc.appointment_date
		});

		d.fields_dict['department'].df.onchange = () => {
			d.set_values({
				'practitioner': ''
			});
			let department = d.get_value('department');
			if (department) {
				d.fields_dict.practitioner.get_query = function() {
					return {
						filters: {
							'department': department
						}
					};
				};
			}
		};

		// disable dialog action initially
		d.get_primary_btn().attr('disabled', true);

		// Field Change Handler

		let fd = d.fields_dict;

		d.fields_dict['appointment_date'].df.onchange = () => {
			show_slots(d, fd);
		};
		d.fields_dict['practitioner'].df.onchange = () => {
			if (d.get_value('practitioner') && d.get_value('practitioner') != selected_practitioner) {
				selected_practitioner = d.get_value('practitioner');
				show_slots(d, fd);
			}
		};
		d.show();
	}

	function show_slots(d, fd) {
		if (d.get_value('appointment_date') && d.get_value('practitioner')) {
			fd.available_slots.html('');
			frappe.call({
				method: 'kis.kis.doctype.patient_appointment.patient_appointment.get_availability_data',
				args: {
					practitioner: d.get_value('practitioner'),
					date: d.get_value('appointment_date')
				},
				callback: (r) => {
					let data = r.message;
					if (data.slot_details.length > 0) {
						let $wrapper = d.fields_dict.available_slots.$wrapper;

						// make buttons for each slot
						let slot_details = data.slot_details;
						let slot_html = '';
						for (let i = 0; i < slot_details.length; i++) {
							slot_html = slot_html + `<label>${slot_details[i].slot_name}</label>`;
							slot_html = slot_html + `<br/>` + slot_details[i].avail_slot.map(slot => {
								let disabled = '';
								let start_str = slot.from_time;
								let slot_start_time = moment(slot.from_time, 'HH:mm:ss');
								let slot_to_time = moment(slot.to_time, 'HH:mm:ss');
								let interval = (slot_to_time - slot_start_time)/60000 | 0;
								// iterate in all booked appointments, update the start time and duration
								slot_details[i].appointments.forEach(function(booked) {
									let booked_moment = moment(booked.appointment_time, 'HH:mm:ss');
									let end_time = booked_moment.clone().add(booked.duration, 'minutes');
									// Deal with 0 duration appointments
									if (booked_moment.isSame(slot_start_time) || booked_moment.isBetween(slot_start_time, slot_to_time)) {
										if(booked.duration == 0){
											disabled = 'disabled="disabled"';
											return false;
										}
									}
									// Check for overlaps considering appointment duration
									if (slot_start_time.isBefore(end_time) && slot_to_time.isAfter(booked_moment)) {
										// There is an overlap
										disabled = 'disabled="disabled"';
										return false;
									}
								});
								return `<button class="btn btn-default"
									data-name=${start_str}
									data-duration=${interval}
									data-service-unit="${slot_details[i].service_unit || ''}"
									style="margin: 0 10px 10px 0; width: 72px;" ${disabled}>
									${start_str.substring(0, start_str.length - 3)}
								</button>`;
							}).join("");
							slot_html = slot_html + `<br/>`;
						}

						$wrapper
							.css('margin-bottom', 0)
							.addClass('text-center')
							.html(slot_html);

						// blue button when clicked
						$wrapper.on('click', 'button', function() {
							let $btn = $(this);
							$wrapper.find('button').removeClass('btn-primary');
							$btn.addClass('btn-primary');
							selected_slot = $btn.attr('data-name');
							service_unit = $btn.attr('data-service-unit');
							duration = $btn.attr('data-duration');
							// enable dialog action
							d.get_primary_btn().attr('disabled', null);
						});

					} else {
						//	fd.available_slots.html('Please select a valid date.'.bold())
						show_empty_state(d.get_value('practitioner'), d.get_value('appointment_date'));
					}
				},
				freeze: true,
				freeze_message: __('Fetching records......')
			});
		} else {
			fd.available_slots.html(__('Appointment date and kis Practitioner are Mandatory').bold());
		}
	}
};

let get_prescribed_procedure = function(frm) {
	if (frm.doc.patient) {
		frappe.call({
			method: 'kis.kis.doctype.patient_appointment.patient_appointment.get_procedure_prescribed',
			args: {patient: frm.doc.patient},
			callback: function(r) {
				if (r.message && r.message.length) {
					show_procedure_templates(frm, r.message);
				} else {
					frappe.msgprint({
						title: __('Not Found'),
						message: __('No Prescribed Procedures found for the selected Patient')
					});
				}
			}
		});
	} else {
		frappe.msgprint({
			title: __('Not Allowed'),
			message: __('Please select a Patient first')
		});
	}
};

let show_procedure_templates = function(frm, result){
	let d = new frappe.ui.Dialog({
		title: __('Prescribed Procedures'),
		fields: [
			{
				fieldtype: 'HTML', fieldname: 'procedure_template'
			}
		]
	});
	let html_field = d.fields_dict.procedure_template.$wrapper;
	html_field.empty();
	$.each(result, function(x, y) {
		let row = $(repl('<div class="col-xs-12" style="padding-top:12px; text-align:center;" >\
		<div class="col-xs-5"> %(encounter)s <br> %(consulting_practitioner)s <br> %(encounter_date)s </div>\
		<div class="col-xs-5"> %(procedure_template)s <br>%(practitioner)s  <br> %(date)s</div>\
		<div class="col-xs-2">\
		<a data-name="%(name)s" data-procedure-template="%(procedure_template)s"\
		data-encounter="%(encounter)s" data-practitioner="%(practitioner)s"\
		data-date="%(date)s"  data-department="%(department)s">\
		<button class="btn btn-default btn-xs">Add\
		</button></a></div></div><div class="col-xs-12"><hr/><div/>', {name:y[0], procedure_template: y[1],
				encounter:y[2], consulting_practitioner:y[3], encounter_date:y[4],
				practitioner:y[5]? y[5]:'', date: y[6]? y[6]:'', department: y[7]? y[7]:''})).appendTo(html_field);
		row.find("a").click(function() {
			frm.doc.procedure_template = $(this).attr('data-procedure-template');
			frm.doc.procedure_prescription = $(this).attr('data-name');
			frm.doc.practitioner = $(this).attr('data-practitioner');
			frm.doc.appointment_date = $(this).attr('data-date');
			frm.doc.department = $(this).attr('data-department');
			refresh_field('procedure_template');
			refresh_field('procedure_prescription');
			refresh_field('appointment_date');
			refresh_field('practitioner');
			refresh_field('department');
			d.hide();
			return false;
		});
	});
	if (!result) {
		let msg = __('There are no procedure prescribed for ') + frm.doc.patient;
		$(repl('<div class="col-xs-12" style="padding-top:20px;" >%(msg)s</div></div>', {msg: msg})).appendTo(html_field);
	}
	d.show();
};



let update_status = function(frm, status){
	let doc = frm.doc;
	frappe.confirm(__('Are you sure you want to cancel this appointment?'),
		function() {
			frappe.call({
				method: 'kis.kis.doctype.patient_appointment.patient_appointment.update_status',
				args: {appointment_id: doc.name, status:status},
				callback: function(data) {
					if (!data.exc) {
						frm.reload_doc();
					}
				}
			});
		}
	);
};

frappe.ui.form.on('Patient Appointment', 'practitioner', function(frm) {
	if (frm.doc.practitioner) {
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'kis Practitioner',
				name: frm.doc.practitioner
			},
			callback: function (data) {
				frappe.model.set_value(frm.doctype, frm.docname, 'department', data.message.department);

			}
		});
	}
});

frappe.ui.form.on('Patient Appointment', 'patient', function(frm) {
	if (frm.doc.patient) {
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Patient',
				name: frm.doc.patient
			}

		});
	}
});

frappe.ui.form.on('Patient Appointment', 'appointment_type', function(frm) {
	if (frm.doc.appointment_type) {
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Appointment Type',
				name: frm.doc.appointment_type
			},
			callback: function(data) {
				frappe.model.set_value(frm.doctype,frm.docname, 'duration',data.message.default_duration);
			}
		});
	}
});

