const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

app.post("/send", async (req, res) => {
  const {
    dealName,
    companyName,
    companyDomain,
    companyAddress,
    contactName,
    contactEmail,
    contactPhone,
    jobNumber,
    jobTotal,
    description,
    stageId // this is the internal ID like "1005328899"
  } = req.body;

  if (!jobNumber || !dealName) {
    return res.status(400).json({ error: "Missing job number or deal name." });
  }

  const HUBSPOT_API = "https://api.hubapi.com";
  const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
  const JOB_NUMBER_FIELD = "kickserv_job_";

  try {
    // 1. Check for contact
    let contactId;
    const contactSearch = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
      {
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "EQ",
            value: contactEmail
          }]
        }]
      },
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    );

    if (contactSearch.data.results.length > 0) {
      contactId = contactSearch.data.results[0].id;
    } else {
      const newContact = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/contacts`,
        {
          properties: {
            email: contactEmail,
            firstname: contactName,
            phone: contactPhone
          }
        },
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      contactId = newContact.data.id;
    }

    // 2. Check for company
    let companyId;
    const companySearch = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/companies/search`,
      {
        filterGroups: [{
          filters: [{
            propertyName: "name",
            operator: "EQ",
            value: companyName
          }]
        }]
      },
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    );

    if (companySearch.data.results.length > 0) {
      companyId = companySearch.data.results[0].id;
    } else {
      const newCompany = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/companies`,
        {
          properties: {
            name: companyName,
            domain: companyDomain,
            address: companyAddress
          }
        },
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      companyId = newCompany.data.id;
    }

    // 3. Check for existing deal by job number
    let dealId;
    const dealSearch = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/deals/search`,
      {
        filterGroups: [{
          filters: [{
            propertyName: JOB_NUMBER_FIELD,
            operator: "EQ",
            value: jobNumber
          }]
        }]
      },
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    );

    const dealPayload = {
      properties: {
        dealname: dealName,
        amount: jobTotal,
        description: description,
        dealstage: stageId,
        pipeline: "default",
        [JOB_NUMBER_FIELD]: jobNumber
      }
    };

    if (dealSearch.data.results.length > 0) {
      dealId = dealSearch.data.results[0].id;
      await axios.patch(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}`,
        dealPayload,
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
    } else {
      const newDeal = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/deals`,
        dealPayload,
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      dealId = newDeal.data.id;
    }

    // 4. Associate contact and company
    if (contactId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}/associations/contact/${contactId}/deal_to_contact`,
        {},
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
    }

    if (companyId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}/associations/company/${companyId}/deal_to_company`,
        {},
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
    }

    res.json({ success: true, message: "✅ Deal sent to HubSpot!" });

  } catch (error) {
    console.error("❌ HubSpot Error:", error.response?.data || error.message);
    res.status(500).json({
      error: "HubSpot Error",
      details: error.response?.data || error.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Kickserv → HubSpot Proxy is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
