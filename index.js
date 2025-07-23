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
    companyAddress,
    contactName,
    contactEmail,
    contactPhone,
    jobNumber,
    jobTotal,
    description,
    stageId,
    locationName
  } = req.body;

  if (!jobNumber || !dealName) {
    return res.status(400).json({ error: "Missing job number or deal name." });
  }

  const HUBSPOT_API = "https://api.hubapi.com";
  const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;
  const JOB_NUMBER_FIELD = "kickserv_job_";

  try {
    console.log("📥 Received payload:", req.body);

    const clean = (str) => (str?.toString().trim() || null);

    const payloadForHubSpot = {
      properties: {
        dealname: clean(dealName),
        amount: jobTotal || 0,
        description: clean(description),
        dealstage: clean(stageId),
        pipeline: "default",
        [JOB_NUMBER_FIELD]: clean(jobNumber)
      }
    };

    // Remove nulls to avoid invalid JSON
    Object.keys(payloadForHubSpot.properties).forEach(key => {
      if (!payloadForHubSpot.properties[key]) delete payloadForHubSpot.properties[key];
    });

    const headers = { Authorization: `Bearer ${HUBSPOT_TOKEN}` };

    // 🌟 Check/create company
    let companyId = null;
    if (companyName) {
      const companySearch = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/companies/search`,
        {
          filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: clean(companyName) }] }]
        },
        { headers }
      );
      if (companySearch.data.results.length > 0) {
        companyId = companySearch.data.results[0].id;
      } else {
        const newCompany = await axios.post(
          `${HUBSPOT_API}/crm/v3/objects/companies`,
          { properties: { name: clean(companyName), address: clean(companyAddress) } },
          { headers }
        );
        companyId = newCompany.data.id;
      }
    }

    // 🌟 Check/create parent company
    let parentCompanyId = null;
    if (parentCompany) {
      const parentSearch = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/companies/search`,
        {
          filterGroups: [{ filters: [{ propertyName: "name", operator: "EQ", value: clean(parentCompany) }] }]
        },
        { headers }
      );
      if (parentSearch.data.results.length > 0) {
        parentCompanyId = parentSearch.data.results[0].id;
      } else {
        const newParent = await axios.post(
          `${HUBSPOT_API}/crm/v3/objects/companies`,
          { properties: { name: clean(parentCompany) } },
          { headers }
        );
        parentCompanyId = newParent.data.id;
      }
    }

    if (companyId && parentCompanyId && companyId !== parentCompanyId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/companies/${companyId}/associations/parent_company/${parentCompanyId}/company_to_company`,
        {},
        { headers }
      );
    }

    // 🌟 Check/create contact
    let contactId = null;
    if (contactEmail) {
      const contactSearch = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/contacts/search`,
        {
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: clean(contactEmail) }] }]
        },
        { headers }
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
          { headers }
        );
        contactId = newContact.data.id;
      }
    }

    // 🌟 Check/create deal
    let dealId = null;
    const dealSearch = await axios.post(
      `${HUBSPOT_API}/crm/v3/objects/deals/search`,
      {
        filterGroups: [{
          filters: [{ propertyName: JOB_NUMBER_FIELD, operator: "EQ", value: clean(jobNumber) }]
        }]
      },
      { headers }
    );

    if (dealSearch.data.results.length > 0) {
      dealId = dealSearch.data.results[0].id;
      await axios.patch(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}`,
        payloadForHubSpot,
        { headers }
      );
      console.log(`🔄 Updated deal: ${dealId}`);
    } else {
      const newDeal = await axios.post(
        `${HUBSPOT_API}/crm/v3/objects/deals`,
        payloadForHubSpot,
        { headers }
      );
      dealId = newDeal.data.id;
      console.log(`✨ Created deal: ${dealId}`);
    }

    // 🌟 Associate deal with company & contact
    if (companyId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}/associations/company/${companyId}/deal_to_company`,
        {},
        { headers }
      );
    }

    if (contactId) {
      await axios.put(
        `${HUBSPOT_API}/crm/v3/objects/deals/${dealId}/associations/contact/${contactId}/deal_to_contact`,
        {},
        { headers }
      );
    }

    res.json({ success: true, message: "✅ Deal processed successfully" });

  } catch (err) {
    console.error("❌ HubSpot Error:", err.response?.data || err.message);
    res.status(500).json({ error: "HubSpot Error", details: err.response?.data || err.message });
  }
});

app.get("/", (req, res) => {
  res.send("✅ Kickserv → HubSpot Proxy is running");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
