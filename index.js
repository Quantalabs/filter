import "dotenv/config";
import express from "express";
import fetch from "sync-fetch";
import fs from "fs";

const app = express();
const router = express.Router();
const port = 5000;

let schools = fetch(
  `https://api.collegedata.fyi/rest/v1/school_browser_rows?apikey=${process.env.APIKEY}`,
).json();
let full_list = fetch(
  `https://www.collegedata.fyi/snapshots/latest/schools.jsonl`,
)
  .text()
  .split("\n")
  .map((x) => {
    try {
      return JSON.parse(x);
    } catch (error) {
      console.log(x);
      return {};
    }
  })
  .filter((x) => x != {});
let lookup = {};

full_list.forEach((x) => {
  lookup[x["school_id"]] = x;
});

let cache = JSON.parse(fs.readFileSync("./cache.json"));

let ok_loc = (state, locs) => {
  let regions = {
    west: ["WA", "OR", "CA", "NV", "ID", "MT", "WY", "UT", "CO"],
    ne: ["ME", "NH", "VT", "MA", "CT", "RI", "NJ", "NY", "PA"],
    mw: [
      "ND",
      "SD",
      "NE",
      "KS",
      "MO",
      "IA",
      "MN",
      "WI",
      "IL",
      "IN",
      "MI",
      "OH",
    ],
    south: [
      "DE",
      "MD",
      "DC",
      "WV",
      "VA",
      "NC",
      "SC",
      "GA",
      "FL",
      "KY",
      "TN",
      "MS",
      "AL",
      "AR",
      "LA",
      "OK",
      "TX",
      "NM",
      "AZ",
    ],
    pacific: ["HI", "AK"],
  };

  for (let reg in regions) {
    if (regions[reg].includes(state) && locs.includes(reg)) {
      return true;
    }
  }
  return false;
};

let fit = (
  min_sat,
  max_sat,
  min_gpa,
  max_gpa,
  loc,
  type,
  admit_max,
  admit_min,
) => {
  let fits = [];
  for (let school of schools) {
    let id = school["school_id"];
    if (
      lookup[id] &&
      ok_loc(lookup[id]["state"], loc) &&
      !fits.includes(id) &&
      school["sat_composite_p50"] > min_sat &&
      school["sat_composite_p50"] < max_sat &&
      school["admitted"] / school["applied"] > admit_min / 100 &&
      school["admitted"] / school["applied"] < admit_max / 100
      // (
      //   (lookup[school['school_id']] && ok_loc(lookup[school['school_id']]["state"], loc)) ||
      //   lookup[school['school_id']] == undefined
      // )
    ) {
      if (cache[id]) {
        let t = cache[id]["type"];
        let g = cache[id]["gpa"];
        if (
          g &&
          ((t && type[0] && t.toLowerCase().includes(type[0].toLowerCase())) ||
            type.length >= 2) &&
          min_gpa <= g &&
          max_gpa >= g
        ) {
          fits.push(id);
        }
      } else {
        let detailed = fetch(
          `https://api.collegedata.fyi/rest/v1/cds_fields?school_id=eq.${id}&apikey=${process.env.APIKEY}`,
        ).json();

        cache[id] = {};

        let gpa = undefined;
        let t = undefined;
        let year = detailed[0]["canonical_year"];
        let stop = false;
        for (let rec of detailed) {
          if (stop) {
            break;
          }
          switch (rec["field_id"]) {
            case "C.1201":
              if (rec["value_num"] >= min_gpa && rec["value_num"] <= max_gpa) {
                gpa = true;
              } else {
                gpa = false;
              }
              cache[id]["gpa"] = rec["value_num"];
              break;
            case "A.201":
              cache[id]["type"] = rec["value_text"];
              if (type.length >= 2) {
                t = true;
                continue;
              }
              if (
                rec["value_text"].toLowerCase().includes(type[0].toLowerCase())
              ) {
                t = true;
              } else {
                t = false;
              }
              break;
            default:
              if (
                (gpa != undefined && t != undefined) ||
                rec["canonical_year"] != year
              ) {
                stop = true;
              }
              break;
          }
        }
        // if ((gpa || gpa == undefined) && (t || t == undefined)) {
        if (gpa && t) {
          fits.push(id);
        }
      }
    }
  }

  fs.writeFileSync("./cache.json", JSON.stringify(cache));

  return fits;
};

router.get("/api/get", (req, res) => {
  let regions = ["west", "ne", "south", "mw", "pacific"];
  let locs = [];

  for (let region of regions) {
    if (req.query[region]) {
      locs.push(region);
    }
  }

  let type = [];
  if (req.query["pub"]) {
    type.push("pub");
  }
  if (req.query["priv"]) {
    type.push("priv");
  }

  res.json(
    fit(
      Number(req.query["sat-min"]),
      Number(req.query["sat-max"]),
      Number(req.query["gpa-min"]),
      Number(req.query["gpa-max"]),
      locs,
      type,
      Number(req.query["admit-max"]),
      Number(req.query["admit-min"]),
    ),
  );
});

router.use(express.static("public"));

app.use("/filter", router);

app.listen(port, () => {
  console.log(`Server @ http://localhost:${port}/`);
});
