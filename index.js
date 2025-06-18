const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

require('dotenv').config();

app.use(cors());
app.use(bodyParser.json());

const HUBSPOT_API_KEY = process.env.HUBSPOT_TOKEN;

app.post('/send-to-hubspot', async (req, res) => {
  const {
    dealName,
    companyName,
    companyAddress,
    contactName,
    email,
    phone,
    jobTotal,
    kickservJobNumber,
    dealStage
  } = req.body;

  if (!dealName || !kickservJobNumber) {
    return res.status(400).json({ error: 'Missing job number or deal name' });
  }

  const headers = {
    Authorization: `Bearer ${HUBSPOT_API_KEY}`,
    'Content-Type': 'application/json'
  };

  try {
    // Check for existing deal by Kickserv job number
    const dealSearch = await axios.post('https://api.hubapi.com/crm/v3/objects/deals/search', {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'kickserv_job_',
              operator: 'EQ',
              value: kickservJobNumber
            }
          ]
        }
      ]
    }, { headers });

    let dealId = null;
    if (dealSearch.data.total > 0) {
      // Deal exists, update it
      dealId = dealSearch.data.results[0].id;
      await axios.patch(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}`, {
        properties: {
          amount: jobTotal || null,
          dealstage: dealStage || null
        }
      }, { headers });
      console.log(`🔄 Updated existing deal ID: ${dealId}`);
    } else {
      // Create deal
      const newDeal = await axios.post('https://api.hubapi.com/crm/v3/objects/deals', {
        properties: {
          dealname: dealName,
          amount: jobTotal || null,
          dealstage: dealStage || null,
          pipeline: 'jobs',
          kickserv_job_: kickservJobNumber
        }
      }, { headers });

      dealId = newDeal.data.id;
      console.log(`✅ Created new deal ID: ${dealId}`);
    }

    // Create or reuse company
    let companyId;
    if (companyName) {
      const companySearch = await axios.post('https://api.hubapi.com/crm/v3/objects/companies/search', {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'name',
                operator: 'EQ',
                value: companyName
              }
            ]
          }
        ]
      }, { headers });

      if (companySearch.data.total > 0) {
        companyId = companySearch.data.results[0].id;
        console.log(`🔎 Found existing company ID: ${companyId}`);
      } else {
        const companyRes = await axios.post('https://api.hubapi.com/crm/v3/objects/companies', {
          properties: {
            name: companyName,
            address: companyAddress || ''
          }
        }, { headers });

        companyId = companyRes.data.id;
        console.log(`🏢 Created new company ID: ${companyId}`);
      }

      // Associate company to deal
      await axios.put(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/companies/${companyId}/deal_to_company`, {}, { headers });
      console.log(`🔗 Associated company ${companyId} to deal ${dealId}`);
    }

    // Create or reuse contact
    let contactId;
    try {
      const contactRes = await axios.post('https://api.hubapi.com/crm/v3/objects/contacts', {
        properties: {
          firstname: contactName || 'Unknown',
          email: email || undefined,
          phone: phone || undefined
        }
      }, { headers });

      contactId = contactRes.data.id;
      console.log(`👤 Created new contact ID: ${contactId}`);
    } catch (err) {
      const msg = err.response?.data?.message;
      if (msg?.includes('Contact already exists') && msg?.includes('Existing ID:')) {
        const match = msg.match(/Existing ID: (\\d+)/);
        if (match && match[1]) {
          contactId = match[1];
          console.log(`👤 Reusing existing contact ID: ${contactId}`);
        }
      } else {
        console.error('❌ Contact creation error:', err.response?.data || err.message);
      }
    }

    // Associate contact to deal
    if (contactId) {
      await axios.put(`https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, {}, { headers });
      console.log(`🔗 Associated contact ${contactId} to deal ${dealId}`);
    }

    res.json({ success: true, dealId });
  } catch (err) {
    console.error('❌ HubSpot Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'HubSpot Error', detail: err.response?.data || err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
