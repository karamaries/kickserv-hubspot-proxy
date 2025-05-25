const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

app.use(cors());
app.use(express.json());

const statusToStage = {
  "New": "1005328899",
  "Unscheduled": "1007595082",
  "Scheduled": "appointmentscheduled",
  "In Progress": "closedwon",
  "On Hold": "1015712527",
  "Completed": "1005243772",
  "Lost": "closedlost"
};

app.post('/create-deal', async (req, res) => {
  const {
    jobNumber,
    dealName,
    jobTotal,
    status,
    contactName,
    email,
    phone
  } = req.body;

  const dealStage = statusToStage[status] || "1005328899";

  try {
    let contactId = null;

    // Step 1: Check for existing contact
    if (email) {
      const searchRes = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/contacts/search',
        {
          filterGroups: [{
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }]
          }]
        },
        {
          headers: {
            Authorization: `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (searchRes.data.results.length > 0) {
        contactId = searchRes.data.results[0].id;
      } else {
        const contactRes = await axios.post(
          'https://api.hubapi.com/crm/v3/objects/contacts',
          {
            properties: {
              email,
              firstname: contactName.split(' ')[0],
              lastname: contactName.split(' ')[1] || '',
              phone
            }
          },
          {
            headers: {
              Authorization: `Bearer ${HUBSPOT_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
        contactId = contactRes.data.id;
      }
    }

    // Step 2: Check if deal with job number already exists
    const dealSearch = await axios.post(
      'https://api.hubapi.com/crm/v3/objects/deals/search',
      {
        filterGroups: [{
          filters: [{
            propertyName: 'kickserv_job_',
            operator: 'EQ',
            value: jobNumber
          }]
        }]
      },
      {
        headers: {
          Authorization: `Bearer ${HUBSPOT_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let dealId;

    if (dealSearch.data.results.length > 0) {
      // Step 3: Update existing deal
      dealId = dealSearch.data.results[0].id;
      await axios.patch(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
        {
          properties: {
            dealname: dealName,
            amount: jobTotal,
            dealstage: dealStage
          }
        },
        {
          headers: {
            Authorization: `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
    } else {
      // Step 4: Create new deal
      const dealRes = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/deals',
        {
          properties: {
            dealname: dealName,
            amount: jobTotal,
            pipeline: 'default',
            dealstage: dealStage,
            kickserv_job_: jobNumber
          }
        },
        {
          headers: {
            Authorization: `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      dealId = dealRes.data.id;
    }

    // Step 5: Associate contact to deal
    if (contactId && dealId) {
      await axios.put(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contact/${contactId}/deal_to_contact`,
        {},
        {
          headers: {
            Authorization: `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    res.json({ success: true, dealId });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'HubSpot error', detail: err.response?.data || err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
