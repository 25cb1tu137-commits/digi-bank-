"use strict";
// Vercel serverless entry point: hands every /api/* request to the Campus Bank server.
const { server } = require("../server");
module.exports = (req, res) => server.emit("request", req, res);
