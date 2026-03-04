#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import dotenv from 'dotenv';
import { TableauClient } from './tableau.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'TABLEAU_PAT_NAME',
  'TABLEAU_PAT_SECRET',
  'TABLEAU_POD',
  'TABLEAU_SITE_NAME'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Missing required environment variable: ${envVar}`);
    console.error('Please set all required variables in your .env file');
    process.exit(1);
  }
}

// Initialize Tableau client
const tableauClient = new TableauClient({
  patName: process.env.TABLEAU_PAT_NAME,
  patSecret: process.env.TABLEAU_PAT_SECRET,
  pod: process.env.TABLEAU_POD,
  siteName: process.env.TABLEAU_SITE_NAME,
  apiVersion: process.env.TABLEAU_API_VERSION || '3.21'
});

// Create MCP server
const server = new Server(
  {
    name: 'tableau-vizql-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'list_datasources',
        description: 'List all published data sources on the Tableau site. Returns datasource names, LUIDs, project information, and metadata.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_datasource_metadata',
        description: 'Get the schema and field information for a specific Tableau datasource. Returns field names, data types, roles, and descriptions.',
        inputSchema: {
          type: 'object',
          properties: {
            datasource_luid: {
              type: 'string',
              description: 'The LUID (unique identifier) of the datasource'
            }
          },
          required: ['datasource_luid']
        }
      },
      {
        name: 'query_datasource',
        description: 'Query a Tableau datasource with specified fields, optional filters, and sorts. Returns data rows matching the query criteria.',
        inputSchema: {
          type: 'object',
          properties: {
            datasource_luid: {
              type: 'string',
              description: 'The LUID (unique identifier) of the datasource'
            },
            fields: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of field names to return in the query results'
            },
            filters: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                    description: 'Field name to filter on'
                  },
                  operator: {
                    type: 'string',
                    description: 'Filter operator (e.g., "equals", "greater-than", "less-than", "contains")'
                  },
                  values: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Values to filter by'
                  }
                },
                required: ['field', 'operator', 'values']
              },
              description: 'Optional array of filter conditions'
            },
            sorts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string',
                    description: 'Field name to sort by'
                  },
                  direction: {
                    type: 'string',
                    enum: ['ASC', 'DESC'],
                    description: 'Sort direction'
                  }
                },
                required: ['field', 'direction']
              },
              description: 'Optional array of sort specifications'
            },
            max_rows: {
              type: 'number',
              description: 'Maximum number of rows to return (default: 1000)',
              default: 1000
            }
          },
          required: ['datasource_luid', 'fields']
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_datasources': {
        const datasources = await tableauClient.listDataSources();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(datasources, null, 2)
            }
          ]
        };
      }

      case 'get_datasource_metadata': {
        if (!args.datasource_luid) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: datasource_luid is required'
              }
            ],
            isError: true
          };
        }

        const metadata = await tableauClient.getDataSourceMetadata(args.datasource_luid);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(metadata, null, 2)
            }
          ]
        };
      }

      case 'query_datasource': {
        if (!args.datasource_luid) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: datasource_luid is required'
              }
            ],
            isError: true
          };
        }

        if (!args.fields || args.fields.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text: 'Error: At least one field is required'
              }
            ],
            isError: true
          };
        }

        const results = await tableauClient.queryDataSource({
          datasource_luid: args.datasource_luid,
          fields: args.fields,
          filters: args.filters || [],
          sorts: args.sorts || [],
          max_rows: args.max_rows || 1000
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2)
            }
          ]
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`
            }
          ],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`
        }
      ],
      isError: true
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Tableau VizQL MCP server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
