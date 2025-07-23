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
    parentCompany,
    companyDomain,
    companyAddress,
    contactName,
    contactEmail,
    contactPhone,
    jobNumber,
    jobTotal,
    description,
    stageId
  } = req.body;

  if (!jobNumber || !dealName) {
    return res.status(400).json({ error: "Missing job number or deal name." });
  }

  const HUBSPOT_API = "https://api.hubapi.com";
  const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
  const JOB_NUMBER_FIELD = "kickserv_job_number"; // <--- replace with your actual HubSpot property internal name

  const clean = (str) => (str?.toString().trim() || null);

  try {
    console.log("📥 Payload received:", req.body);

    // 1️⃣ Parent company
    let parentCompanyId = null;
    if (parentCompany) {
      const parentSearch = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/companies/search`,
        {
          filterGroups: [{
            filters: [{ propertyName: "name", operator: "EQ", value: clean(parentCompany) }]
          }]
        },
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );

      if (parentSearch.data.results.length > 0) {
        parentCompanyId = parentSearch.data.results[0].id;
      } else {
        const newParent = await axios.post(
          `${HUBSPOT_API}/crm/v3/objects/companies`,
          { properties: { name: clean(parentCompany) } },
          { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
        );
        parentCompanyId = newParent.data.id;
      }
    }

    // 2️⃣ Child company
    let companyId = null;
    const companySearch = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/companies/search`,
      {
        filterGroups: [{
          filters: [{ propertyName: "name", operator: "EQ", value: clean(companyName) }]
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
            name: clean(companyName),
            domain: clean(companyDomain),
            address: clean(companyAddress)
          }
        },
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      companyId = newCompany.data.id;
    }

    // 3️⃣ Associate child → parent
    if (parentCompanyId && companyId && parentCompanyId !== companyId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/parent_company/${parentCompanyId}/company_to_company`,
        {},
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
    }

    // 4️⃣ Contact
    let contactId = null;
    if (contactEmail) {
      const contactSearch = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [{
            filters: [{ propertyName: "email", operator: "EQ", value: clean(contactEmail) }]
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
              email: clean(contactEmail),
              firstname: clean(contactName),
              phone: clean(contactPhone)
            }
          },
          { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
        );
        contactId = newContact.data.id;
      }
    }

    // 5️⃣ Deal
    let dealId = null;
    const dealSearch = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/deals/search`,
      {
        filterGroups: [{
          filters: [{ propertyName: JOB_NUMBER_FIELD, operator: "EQ", value: clean(jobNumber) }]
        }]
      },
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    );

    const dealPayload = {
      properties: {
        dealname: clean(dealName),
        amount: jobTotal || 0,
        description: clean(description),
        dealstage: clean(stageId),
        pipeline: "default",
        [JOB_NUMBER_FIELD]: clean(jobNumber)
      }
    };

    // remove empty/null properties
    Object.keys(dealPayload.properties).forEach(k => {
      if (!dealPayload.properties[k]) delete dealPayload.properties[k];
    });

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

    // 6️⃣ Associate deal → contact & company
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

  } catch (err) {
    console.error("❌ HubSpot Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "HubSpot Error",
      details: err.response?.data || err.message
    });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Kickserv → HubSpot Proxy is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
