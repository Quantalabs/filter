import express from "express";
import fetch from "sync-fetch";

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
    if (!lookup[school["school_id"]]) {
      continue;
    }
    if (
      school["sat_composite_p50"] > min_sat &&
      school["sat_composite_p50"] < max_sat &&
      school["admitted"] / school["applied"] > admit_min / 100 &&
      school["admitted"] / school["applied"] < admit_max / 100 &&
      // (
      //   (lookup[school['school_id']] && ok_loc(lookup[school['school_id']]["state"], loc)) ||
      //   lookup[school['school_id']] == undefined
      // )
      ok_loc(lookup[school["school_id"]]["state"], loc)
    ) {
      if (fits.includes(school["school_id"])) {
        continue;
      }

      let detailed = fetch(
        `https://api.collegedata.fyi/rest/v1/cds_fields?school_id=eq.${school["school_id"]}&apikey=${process.env.APIKEY}`,
      ).json();

      let gpa = true;
      let t = true;
      let year = detailed[0]["canonical_year"];
      for (let rec of detailed) {
        if (
          rec["field_id"] == "A.201" &&
          school["school_id"] ==
            "california-polytechnic-state-university-san-luis-obispo"
        ) {
          console.log(type, school);
        }
        switch (rec["field_id"]) {
          case "C1201":
            if (rec["value_num"] >= min_gpa && rec["value_num"] <= max_gpa) {
              gpa = true;
            } else {
              gpa = false;
            }
          case "A.102":
            if (
              type.reduce((acc, curr) => {
                if (acc == true || rec["value_text"].includes(curr)) {
                  return true;
                } else {
                  return false;
                }
              }, false)
            ) {
              t = true;
            } else {
              t = false;
            }
          default:
            continue;
        }
      }
      if (gpa && t) {
        fits.push(school["school_id"]);
      }
    }
  }

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

app.use('/filter', router)

app.listen(port, () => {
  console.log(`Server @ http://localhost:${port}/`);
});
