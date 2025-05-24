const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const HUBSPOT_TOKEN = process.env.HUBSPOT_TOKEN;

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

        const dealId = dealRes.data.id;

        if (contactId) {
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
