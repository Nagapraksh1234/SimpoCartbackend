const mongoose = require("mongoose");
const Activity = require("../models/Activity");
const Appointment = require("../models/Appointment");
const { nextNumber } = require("../models/Counter");
const Customer = require("../models/Customer");
const JobCard = require("../models/JobCard");
const Lead = require("../models/Lead");
const Quotation = require("../models/Quotation");
const Vehicle = require("../models/Vehicle");
const { logActivity, requireStage } = require("../utils/Stageservice");
const { must } = require("../utils/Httperror");

const { BOARD_STAGES } = Lead;

/* ---------- Board ---------- */

exports.getBoard = async (_req, res) => {
  const leads = await Lead.find({ stage: { $in: BOARD_STAGES } })
    .sort({ updatedAt: -1 })
    .populate("customerId", "name phone")
    .populate("vehicleId", "regNo make model")
    .populate("quotationId", "quoteNo total status")
    .populate("appointmentId", "slotStart bay status")
    .populate("jobCardId", "jobNo status")
    .lean();

  const board = {};
  BOARD_STAGES.forEach((s) => (board[s] = []));
  leads.forEach((l) => board[l.stage].push(l));

  const counts = {};
  BOARD_STAGES.forEach((s) => (counts[s] = board[s].length));
  res.json({ counts, board });
};

/* ---------- 1. Follow-up ---------- */

exports.createLead = async (req, res) => {
  const { name, phone, email, regNo, make, model, requirement, nextCallAt, assignedAgent } = req.body;
  must(name && phone, 400, "name and phone are required");
  must(regNo, 400, "regNo is required");

  const customer = await Customer.findOneAndUpdate(
    { phone },
    { $setOnInsert: { name, email } },
    { new: true, upsert: true }
  );
  const vehicle = await Vehicle.findOneAndUpdate(
    { regNo: String(regNo).toUpperCase() },
    { $setOnInsert: { customerId: customer._id, make, model } },
    { new: true, upsert: true }
  );

  const lead = await Lead.create({
    customerId: customer._id,
    vehicleId: vehicle._id,
    requirement,
    nextCallAt,
    assignedAgent,
  });
  await logActivity(lead._id, "lead_created", requirement, assignedAgent);
  res.status(201).json(lead);
};

exports.logCall = async (req, res) => {
  const { callStatus, note, nextCallAt, by } = req.body;
  must(["callback", "no_answer", "connected"].includes(callStatus), 400, "invalid callStatus");

  const lead = await Lead.findById(req.params.id);
  must(lead, 404, "Lead not found");
  requireStage(lead.stage, ["followup"]);

  lead.callStatus = callStatus;
  if (nextCallAt) lead.nextCallAt = new Date(nextCallAt);
  await lead.save();
  await logActivity(lead._id, "call_logged", `${callStatus}${note ? ": " + note : ""}`, by);
  res.json(lead);
};

/* ---------- 2. Quotation ---------- */

exports.saveQuotation = async (req, res) => {
  const { items } = req.body;
  must(Array.isArray(items) && items.length > 0, 400, "items must be a non-empty array");
  const total = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.rate), 0);

  const lead = await Lead.findById(req.params.id);
  must(lead, 404, "Lead not found");
  requireStage(lead.stage, ["followup", "quotation"]);

  let quotation = lead.quotationId ? await Quotation.findById(lead.quotationId) : null;
  if (quotation) {
    must(quotation.status === "draft", 409, "Only draft quotations can be edited");
    quotation.set({ items, total });
    await quotation.save();
  } else {
    quotation = await Quotation.create({
      leadId: lead._id,
      quoteNo: await nextNumber("quote", "QT", 1000),
      items,
      total,
    });
    lead.quotationId = quotation._id;
  }

  if (lead.stage === "followup") {
    lead.stage = "quotation";
    await logActivity(lead._id, "stage_changed", "followup -> quotation");
  }
  await lead.save();
  res.status(201).json(quotation);
};

exports.sendQuotation = async (req, res) => {
  const quotation = await Quotation.findById(req.params.id);
  must(quotation, 404, "Quotation not found");
  must(quotation.status === "draft" || quotation.status === "sent", 409, "Quotation already answered");

  const lead = await Lead.findById(quotation.leadId);
  must(lead, 404, "Lead not found");
  requireStage(lead.stage, ["quotation", "approval"]);

  quotation.status = "sent";
  quotation.sentAt = new Date();
  await quotation.save();

  if (lead.stage === "quotation") {
    lead.stage = "approval";
    await lead.save();
    await logActivity(lead._id, "stage_changed", "quotation -> approval");
  }
  res.json(quotation);
};

/* ---------- 3. Customer approval ---------- */

exports.respondQuotation = async (req, res) => {
  const { approved, reason } = req.body;
  must(typeof approved === "boolean", 400, "approved (true/false) is required");

  const quotation = await Quotation.findById(req.params.id);
  must(quotation, 404, "Quotation not found");
  must(quotation.status === "sent", 409, "Quotation has not been sent");

  quotation.status = approved ? "approved" : "rejected";
  quotation.respondedAt = new Date();
  if (!approved) quotation.rejectReason = reason;
  await quotation.save();

  // Lead stays in "approval" so the card shows Approved / Rejected on the board.
  await logActivity(quotation.leadId, approved ? "quote_approved" : "quote_rejected", reason);
  res.json(quotation);
};

exports.markLost = async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  must(lead, 404, "Lead not found");
  lead.stage = "lost";
  await lead.save();
  await logActivity(lead._id, "lead_lost", req.body && req.body.reason);
  res.json(lead);
};

/* ---------- 4. Appointment ---------- */

exports.bookAppointment = async (req, res) => {
  const { slotStart, bay } = req.body;
  const slot = new Date(slotStart);
  must(!isNaN(slot.getTime()), 400, "valid slotStart is required");
  must(bay, 400, "bay is required");

  const lead = await Lead.findById(req.params.id);
  must(lead, 404, "Lead not found");
  requireStage(lead.stage, ["approval"]);

  const quotation = await Quotation.findById(lead.quotationId);
  must(quotation && quotation.status === "approved", 409, "Quotation must be approved first");

  const clash = await Appointment.findOne({ bay, slotStart: slot, status: "booked" });
  must(!clash, 409, `Bay ${bay} is already booked for that slot`);

  const appointment = await Appointment.create({
    leadId: lead._id,
    quotationId: quotation._id,
    slotStart: slot,
    bay,
  });
  lead.appointmentId = appointment._id;
  lead.stage = "appointment";
  await lead.save();
  await logActivity(lead._id, "stage_changed", "approval -> appointment");
  res.status(201).json(appointment);
};

exports.markArrived = async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  must(appointment, 404, "Appointment not found");
  must(appointment.status === "booked", 409, `Appointment is ${appointment.status}`);

  appointment.status = "arrived";
  await appointment.save();
  await logActivity(appointment.leadId, "vehicle_arrived");
  res.json(appointment);
};

/* ---------- 5. Convert to job card (transaction) ---------- */

exports.convertToJobCard = async (req, res) => {
  const appointment = await Appointment.findById(req.params.id);
  must(appointment, 404, "Appointment not found");
  must(appointment.status === "arrived", 409, "Vehicle has not arrived yet");

  const lead = await Lead.findById(appointment.leadId);
  must(lead, 404, "Lead not found");
  requireStage(lead.stage, ["appointment"]);

  const quotation = await Quotation.findById(appointment.quotationId);
  must(quotation, 404, "Quotation not found");

  const jobNo = await nextNumber("jobcard", "JC", 2000); // outside the transaction on purpose
  const session = await mongoose.startSession();
  try {
    let jobCard;
    await session.withTransaction(async () => {
      [jobCard] = await JobCard.create(
        [{ jobNo, leadId: lead._id, appointmentId: appointment._id, items: quotation.items }],
        { session }
      );
      lead.stage = "jobcard";
      lead.jobCardId = jobCard._id;
      await lead.save({ session });
      await logActivity(lead._id, "stage_changed", "appointment -> jobcard", undefined, session);
    });
    res.status(201).json(jobCard);
  } finally {
    await session.endSession();
  }
};

exports.updateJobCard = async (req, res) => {
  const { status, technician } = req.body;
  const jobCard = await JobCard.findById(req.params.id);
  must(jobCard, 404, "Job card not found");

  if (technician) jobCard.technician = technician;
  if (status) {
    must(["open", "in_progress", "ready", "delivered"].includes(status), 400, "invalid status");
    jobCard.status = status;
  }
  await jobCard.save();

  if (status === "delivered") {
    await Lead.findByIdAndUpdate(jobCard.leadId, { stage: "closed" });
    await logActivity(jobCard.leadId, "delivered");
  }
  res.json(jobCard);
};

/* ---------- Timeline ---------- */

exports.getActivities = async (req, res) => {
  const items = await Activity.find({ leadId: req.params.id }).sort({ createdAt: -1 });
  res.json(items);
};