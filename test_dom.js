const { JSDOM } = require("jsdom");
const fs = require("fs");

const html = fs.readFileSync("admin.html", "utf-8");
const js = fs.readFileSync("js/admin-ui.js", "utf-8").replace(/import .*/g, ""); // Mock imports

const dom = new JSDOM(html, { runScripts: "dangerously" });
try {
  dom.window.eval(js);
  console.log("SUCCESS!");
} catch (e) {
  console.error("DOM ERROR:", e);
}
