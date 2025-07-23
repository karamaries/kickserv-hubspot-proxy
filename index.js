const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const app = express();
const PORT = process.env.PORT || 10000;

app.use(bodyParser.json());

const HUBSPOT_API = "https://api.hubapi.com";
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
const JOB_NUMBER_FIELD = "kickserv_job_";

const trim = (str) => (str ? str.toString().trim() : "");

const stripEmpty = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined && v !== "")
  );
};

app.post("/send", async (req, res) => {
  const {
    dealName,
    companyName,      // child company
    parentCompany,    // parent company
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

  try {
    console.log("📥 Payload received:", req.body);

    let parentCompanyId = null;
    if (parentCompany) {
      const parentSearch = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/companies/search`,
        {
          filterGroups: [{
            filters: [{ propertyName: "name", operator: "EQ", value: trim(parentCompany) }]
          }]
        },
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );

      if (parentSearch.data.results.length > 0) {
        parentCompanyId = parentSearch.data.results[0].id;
        console.log(`✅ Found parent company: ${parentCompanyId}`);
      } else {
        const newParent = await axios.post(
          `${HUBSPOT_API}/crm/v3/objects/companies`,
          { properties: { name: trim(parentCompany) } },
          { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
        );
        parentCompanyId = newParent.data.id;
        console.log(`✨ Created parent company: ${parentCompanyId}`);
      }
    }

    let companyId = null;
    const companySearch = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/companies/search`,
      {
        filterGroups: [{
          filters: [{ propertyName: "name", operator: "EQ", value: trim(companyName) }]
        }]
      },
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    );

    if (companySearch.data.results.length > 0) {
      companyId = companySearch.data.results[0].id;
      console.log(`✅ Found child company: ${companyId}`);
    } else {
      const newCompany = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/companies`,
        {
          properties: stripEmpty({
            name: trim(companyName),
            domain: trim(companyDomain),
            address: trim(companyAddress)
          })
        },
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      companyId = newCompany.data.id;
      console.log(`✨ Created child company: ${companyId}`);
    }

    if (parentCompanyId && companyId && parentCompanyId !== companyId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/parent_company/${parentCompanyId}/company_to_company`,
        {},
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      console.log(`🔗 Linked child ${companyId} → parent ${parentCompanyId}`);
    }

    let contactId = null;
    if (contactEmail) {
      const contactSearch = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [{
            filters: [{ propertyName: "email", operator: "EQ", value: trim(contactEmail) }]
          }]
        },
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );

      if (contactSearch.data.results.length > 0) {
        contactId = contactSearch.data.results[0].id;
        console.log(`✅ Found contact: ${contactId}`);
      } else {
        const newContact = await axios.post(
          `${HUBSPOT_API}/crm/v3/objects/contacts`,
          {
            properties: stripEmpty({
              email: trim(contactEmail),
              firstname: trim(contactName),
              phone: trim(contactPhone)
            })
          },
          { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
        );
        contactId = newContact.data.id;
        console.log(`✨ Created contact: ${contactId}`);
      }
    } else {
      console.log("ℹ️ No contact email provided — contact will not be created.");
    }

    let dealId = null;
    const dealSearch = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/deals/search`,
      {
        filterGroups: [{
          filters: [{ propertyName: JOB_NUMBER_FIELD, operator: "EQ", value: trim(jobNumber) }]
        }]
      },
      { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
    );

    const dealPayload = {
      properties: stripEmpty({
        dealname: trim(dealName),
        amount: jobTotal || 0,
        description: trim(description),
        dealstage: trim(stageId),
        pipeline: "default",
        [JOB_NUMBER_FIELD]: trim(jobNumber)
      })
    };

    if (dealSearch.data.results.length > 0) {
      dealId = dealSearch.data.results[0].id;
      await axios.patch(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}`,
        dealPayload,
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      console.log(`🔄 Updated deal: ${dealId}`);
    } else {
      const newDeal = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/deals`,
        dealPayload,
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      dealId = newDeal.data.id;
      console.log(`✨ Created deal: ${dealId}`);
    }

    if (contactId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}/associations/contact/${contactId}/deal_to_contact`,
        {},
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      console.log(`🔗 Linked deal → contact: ${contactId}`);
    }

    if (companyId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}/associations/company/${companyId}/deal_to_company`,
        {},
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      );
      console.log(`🔗 Linked deal → company: ${companyId}`);
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
