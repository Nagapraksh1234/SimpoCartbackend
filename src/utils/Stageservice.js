const Activity = require("../models/Activity");
const { HttpError } = require("./htt`perror");

/** Order of the pipeline. A lead can only move one step forward. */
const NEXT_STAGE = {
  followup: "quotation",
  quotation: "approval",
  approval: "appointment",
  appointment: "jobcard",
};

function requireStage(current, allowed) {
  if (!allowed.includes(current)) {
    throw new HttpError(409, `Lead is in '${current}' stage, expected ${allowed.join(" or ")}`);
  }
}

async function logActivity(leadId, type, note, by, session) {
  await Activity.create([{ leadId, type, note, by }], { session });
}

module.exports = { NEXT_STAGE, requireStage, logActivity };