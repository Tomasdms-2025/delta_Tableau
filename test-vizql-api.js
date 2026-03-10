#!/usr/bin/env node

/**
 * Comprehensive VizQL Data Service API Test
 * Based on official Tableau documentation
 */

import { TableauClient } from './tableau.js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const client = new TableauClient({
  patName: process.env.TABLEAU_PAT_NAME,
  patSecret: process.env.TABLEAU_PAT_SECRET,
  pod: process.env.TABLEAU_POD,
  siteName: process.env.TABLEAU_SITE_NAME
});

async function testAuthentication() {
  console.log('\n========================================');
  console.log('TEST 1: Authentication');
  console.log('========================================');

  try {
    const auth = await client.signIn();
    console.log('✓ Authentication successful');
    console.log('  Token:', auth.token.substring(0, 20) + '...');
    console.log('  Site ID:', auth.siteId);
    return true;
  } catch (error) {
    console.error('✗ Authentication failed:', error.message);
    return false;
  }
}

async function testListDatasources() {
  console.log('\n========================================');
  console.log('TEST 2: List Datasources (REST API)');
  console.log('========================================');

  try {
    const datasources = await client.listDataSources();
    console.log(`✓ Found ${datasources.length} datasources`);

    // Pick a datasource for testing
    const testDs = datasources.find(ds => ds.name.includes('MBR_SUBSCRIPTION_MEMBERSHIP'));
    if (testDs) {
      console.log(`  Using datasource: ${testDs.name}`);
      console.log(`  LUID: ${testDs.luid}`);
      return testDs.luid;
    } else {
      console.log('  Using first datasource:', datasources[0].name);
      console.log(`  LUID: ${datasources[0].luid}`);
      return datasources[0].luid;
    }
  } catch (error) {
    console.error('✗ Failed to list datasources:', error.message);
    return null;
  }
}

async function testReadMetadata(datasourceLuid) {
  console.log('\n========================================');
  console.log('TEST 3: Read Metadata (VizQL API)');
  console.log('========================================');

  const headers = await client.getHeaders();

  // Test 1: Basic metadata request
  console.log('\n3a. Basic metadata request:');
  try {
    const response = await axios.post(
      `https://${process.env.TABLEAU_POD}.online.tableau.com/api/v1/vizql-data-service/read-metadata`,
      {
        datasource: {
          datasourceLuid: datasourceLuid
        }
      },
      {
        headers,
        validateStatus: () => true
      }
    );

    if (response.status === 200) {
      console.log('✓ Metadata retrieved successfully');
      console.log(`  Fields: ${response.data.data?.length || 0}`);

      if (response.data.data?.length > 0) {
        const field = response.data.data[0];
        console.log('\n  Sample field:');
        console.log(`    fieldName: ${field.fieldName}`);
        console.log(`    fieldCaption: ${field.fieldCaption}`);
        console.log(`    dataType: ${field.dataType}`);
        console.log(`    fieldRole: ${field.fieldRole}`);
        console.log(`    fieldType: ${field.fieldType}`);

        return response.data.data;
      }
    } else {
      console.error('✗ Metadata request failed');
      console.error(`  Status: ${response.status}`);
      console.error(`  Response: ${JSON.stringify(response.data, null, 2)}`);
      return null;
    }
  } catch (error) {
    console.error('✗ Exception:', error.message);
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return null;
  }

  // Test 2: With interpretFieldCaptionsAsFieldNames option
  console.log('\n3b. Metadata with interpretFieldCaptionsAsFieldNames:');
  try {
    const response = await axios.post(
      `https://${process.env.TABLEAU_POD}.online.tableau.com/api/v1/vizql-data-service/read-metadata`,
      {
        datasource: {
          datasourceLuid: datasourceLuid
        },
        interpretFieldCaptionsAsFieldNames: true
      },
      {
        headers,
        validateStatus: () => true
      }
    );

    if (response.status === 200) {
      console.log('✓ Option works - fieldName can be used in queries');
    } else {
      console.log('✗ Option failed - must use fieldCaption in queries');
    }
  } catch (error) {
    console.log('  Skipping optional test');
  }
}

async function testQueryDatasource(datasourceLuid, fields) {
  console.log('\n========================================');
  console.log('TEST 4: Query Datasource (VizQL API)');
  console.log('========================================');

  const headers = await client.getHeaders();

  // Pick 2 simple fields for testing
  const testFields = fields
    .filter(f => f.dataType === 'STRING' && f.fieldRole === 'DIMENSION')
    .slice(0, 2);

  if (testFields.length < 2) {
    console.log('✗ Not enough suitable fields for testing');
    return;
  }

  console.log(`\nUsing fields: ${testFields.map(f => f.fieldCaption).join(', ')}`);

  // Test 1: Basic query with rowLimit option
  console.log('\n4a. Basic query with rowLimit:');
  try {
    const response = await axios.post(
      `https://${process.env.TABLEAU_POD}.online.tableau.com/api/v1/vizql-data-service/query-datasource`,
      {
        datasource: {
          datasourceLuid: datasourceLuid
        },
        query: {
          fields: testFields.map(f => ({ fieldCaption: f.fieldCaption }))
        },
        options: {
          rowLimit: 5,
          returnFormat: 'OBJECTS',
          debug: true
        }
      },
      {
        headers,
        validateStatus: () => true,
        timeout: 30000
      }
    );

    if (response.status === 200) {
      console.log('✓ Query successful');
      console.log(`  Rows: ${response.data.data?.length || 0}`);

      if (response.data.data?.length > 0) {
        console.log('\n  Sample row:');
        console.log(`    ${JSON.stringify(response.data.data[0])}`);
      }
    } else {
      console.error('✗ Query failed');
      console.error(`  Status: ${response.status}`);
      console.error(`  Response: ${JSON.stringify(response.data, null, 2)}`);
    }
  } catch (error) {
    console.error('✗ Exception:', error.message);
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
  }

  // Test 2: Query with filter
  console.log('\n4b. Query with SET filter:');
  try {
    const filterField = testFields[0];
    const response = await axios.post(
      `https://${process.env.TABLEAU_POD}.online.tableau.com/api/v1/vizql-data-service/query-datasource`,
      {
        datasource: {
          datasourceLuid: datasourceLuid
        },
        query: {
          fields: [{ fieldCaption: filterField.fieldCaption }],
          filters: [{
            field: { fieldCaption: filterField.fieldCaption },
            filterType: 'SET',
            values: ['test'],
            exclude: false
          }]
        },
        options: {
          rowLimit: 3,
          returnFormat: 'OBJECTS'
        }
      },
      {
        headers,
        validateStatus: () => true,
        timeout: 30000
      }
    );

    if (response.status === 200) {
      console.log('✓ Filtered query successful');
      console.log(`  Rows: ${response.data.data?.length || 0}`);
    } else {
      console.log('  Filter test returned non-200 (may be expected if no matching data)');
    }
  } catch (error) {
    console.log('  Filter test skipped (optional)');
  }
}

async function testPermissions() {
  console.log('\n========================================');
  console.log('TEST 5: Permission Check');
  console.log('========================================');

  console.log('Checking PAT permissions...');
  console.log(`  PAT Name: ${process.env.TABLEAU_PAT_NAME}`);
  console.log(`  Site: ${process.env.TABLEAU_SITE_NAME}`);
  console.log(`  Pod: ${process.env.TABLEAU_POD}`);
  console.log('\nNote: VizQL Data Service requires:');
  console.log('  - Read access to published datasources');
  console.log('  - PAT with appropriate site permissions');
  console.log('  - Datasource must be published (not embedded)');
}

// Run all tests
async function runTests() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║  VizQL Data Service API Test Suite    ║');
  console.log('╚════════════════════════════════════════╝');

  // Test authentication
  const authSuccess = await testAuthentication();
  if (!authSuccess) {
    console.log('\n❌ Authentication failed - cannot proceed with tests');
    process.exit(1);
  }

  // Test listing datasources
  const datasourceLuid = await testListDatasources();
  if (!datasourceLuid) {
    console.log('\n❌ No datasources available - cannot proceed with VizQL tests');
    process.exit(1);
  }

  // Test metadata endpoint
  const fields = await testReadMetadata(datasourceLuid);
  if (!fields || fields.length === 0) {
    console.log('\n❌ Metadata endpoint failed or returned no fields');
    console.log('This suggests either:');
    console.log('  1. Permission issue with VizQL Data Service');
    console.log('  2. Datasource is not compatible with VizQL');
    console.log('  3. Request format is incorrect');
  } else {
    // Test query endpoint
    await testQueryDatasource(datasourceLuid, fields);
  }

  // Check permissions
  await testPermissions();

  console.log('\n========================================');
  console.log('Test Suite Complete');
  console.log('========================================\n');
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
