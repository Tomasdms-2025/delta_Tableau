# Tableau VizQL MCP Server

A Model Context Protocol (MCP) server that wraps the Tableau VizQL Data Service API, allowing you to query published Tableau data sources directly from Claude Code.

## Features

- **Authentication**: Secure PAT (Personal Access Token) authentication with automatic token refresh
- **Three MCP Tools**:
  - `list_datasources` - List all published data sources on your Tableau site
  - `get_datasource_metadata` - Get schema and field information for any datasource
  - `query_datasource` - Query datasources with fields, filters, and sorts

## Prerequisites

- Node.js 16+ installed
- A Tableau Online account with appropriate permissions
- A Tableau Personal Access Token (PAT)

## Installation

1. **Clone or navigate to this repository**:
   ```bash
   cd /Users/tomasdms/Documents/_code/_delta_Tableau
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and add your Tableau credentials (see Configuration section below).

## Configuration

### Getting Your Tableau Credentials

#### 1. Create a Personal Access Token (PAT) with VizQL Access

**Important**: The PAT must have **VizQL Data Service API access** permission to use the `get_datasource_metadata` and `query_datasource` tools.

1. Sign in to Tableau Online
2. Click your profile icon (top right) → **My Account Settings**
3. Scroll to **Personal Access Tokens** section
4. Click **Create new token**
5. Enter a token name (e.g., "Claude MCP VizQL Server")
6. **Critical**: Ensure the token has "VizQL Data Service API Access" permission enabled
7. Click **Create**
8. **Important**: Copy both the **Token Name** and **Token Secret** immediately (you won't see the secret again)

**Note**: If you get a 403 error with message "VIZQL_DATA_API_ACCESS", your PAT lacks VizQL permissions. Contact your Tableau administrator to enable this permission or create a new PAT with VizQL access.

#### 2. Find Your Pod Name

Your pod is in your Tableau Online URL:
- URL format: `https://{POD}.online.tableau.com`
- Example: If your URL is `https://us-east-1.online.tableau.com`, your pod is `us-east-1`

Common pods: `us-east-1`, `us-west-2`, `eu-west-1`, `ap-southeast-1`, `prod-ca-a`, etc.

#### 3. Find Your Site Name

Your site name is the content URL in your Tableau Online site:
- Go to your Tableau Online home page
- Check the URL: `https://{pod}.online.tableau.com/#/site/{SITE_NAME}/home`
- If the URL shows `/#/home` (no site name), use an empty string `""` or `""`
- Otherwise, use the site name from the URL

#### 4. Find a Datasource LUID

**Method 1: Via Tableau UI**
1. Navigate to **Explore** → **Data Sources**
2. Click on a data source
3. Look at the URL: `https://{pod}.online.tableau.com/#/site/{site}/datasources/{LUID}`
4. Copy the LUID (a long alphanumeric string like `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

**Method 2: Via MCP Tool**
Once the server is running, use the `list_datasources` tool to see all available datasources and their LUIDs.

### Environment Variables

Edit your `.env` file with these values:

```env
TABLEAU_PAT_NAME=your_token_name_here
TABLEAU_PAT_SECRET=your_token_secret_here
TABLEAU_POD=us-east-1
TABLEAU_SITE_NAME=your_site_name

# Optional: API Version (defaults to 3.21)
# TABLEAU_API_VERSION=3.21
```

## Registering with Claude Code

To use this MCP server in Claude Code, add it to your MCP configuration:

**Option 1: Using Claude CLI**
```bash
claude mcp add tableau-vizql node /Users/tomasdms/Documents/_code/_delta_Tableau/index.js
```

**Option 2: Manual Configuration**
Edit `~/.claude/mcp_servers.json` and add:

```json
{
  "mcpServers": {
    "tableau-vizql": {
      "command": "node",
      "args": ["/Users/tomasdms/Documents/_code/_delta_Tableau/index.js"]
    }
  }
}
```

After adding the server, restart Claude Code for the changes to take effect.

## Usage Examples

Once configured, you can use these tools in Claude Code:

### Example 1: List All Data Sources

```
Can you list all available Tableau data sources?
```

This calls `list_datasources` and returns:
```json
[
  {
    "luid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "Sales Data",
    "projectName": "Marketing",
    "ownerName": "john.doe",
    "isCertified": true,
    "description": "Q4 sales metrics"
  }
]
```

### Example 2: Get Datasource Schema

```
What fields are available in datasource a1b2c3d4-e5f6-7890-abcd-ef1234567890?
```

This calls `get_datasource_metadata`:
```json
{
  "datasourceLuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "fields": [
    {
      "name": "Sales",
      "dataType": "real",
      "role": "measure"
    },
    {
      "name": "Region",
      "dataType": "string",
      "role": "dimension"
    },
    {
      "name": "Date",
      "dataType": "date",
      "role": "dimension"
    }
  ]
}
```

### Example 3: Query Data

```
Query datasource a1b2c3d4-e5f6-7890-abcd-ef1234567890
and get the Region, Sales, and Date fields,
filtered to only West region,
sorted by Sales descending,
limit to 100 rows
```

This calls `query_datasource`:
```json
{
  "datasourceLuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "rowCount": 100,
  "fields": ["Region", "Sales", "Date"],
  "rows": [
    {
      "Region": "West",
      "Sales": 45000,
      "Date": "2024-01-15"
    },
    {
      "Region": "West",
      "Sales": 42000,
      "Date": "2024-01-16"
    }
  ]
}
```

### Example 4: Complex Query with Multiple Filters

```
Query the sales datasource (LUID: abc123...)
Get fields: Product, Revenue, Quantity
Filter: Category equals "Electronics" AND Revenue greater than 10000
Sort by Revenue descending
Limit to 50 rows
```

Tool parameters:
```json
{
  "datasource_luid": "abc123...",
  "fields": ["Product", "Revenue", "Quantity"],
  "filters": [
    {
      "field": "Category",
      "operator": "equals",
      "values": ["Electronics"]
    },
    {
      "field": "Revenue",
      "operator": "greater-than",
      "values": ["10000"]
    }
  ],
  "sorts": [
    {
      "field": "Revenue",
      "direction": "DESC"
    }
  ],
  "max_rows": 50
}
```

## Tool Reference

### `list_datasources`

Lists all published data sources on your Tableau site.

**Parameters**: None

**Returns**: Array of datasource objects with LUID, name, project, owner, and metadata.

---

### `get_datasource_metadata`

Gets the schema and field information for a specific datasource.

**Parameters**:
- `datasource_luid` (string, required): The LUID of the datasource

**Returns**: Object containing datasource LUID, array of fields with names/types/roles, and raw metadata.

---

### `query_datasource`

Queries a datasource with specified fields, filters, and sorts.

**Parameters**:
- `datasource_luid` (string, required): The LUID of the datasource
- `fields` (array, required): Array of field names to return
- `filters` (array, optional): Array of filter objects:
  - `field` (string): Field name to filter on
  - `operator` (string): Filter operator (equals, greater-than, less-than, contains, etc.)
  - `values` (array): Values to filter by
- `sorts` (array, optional): Array of sort objects:
  - `field` (string): Field name to sort by
  - `direction` (string): ASC or DESC
- `max_rows` (number, optional): Maximum rows to return (default: 1000)

**Returns**: Object containing datasource LUID, row count, fields, and array of data rows.

## Filter Operators

Common operators for the `filters` parameter:

- `equals` - Exact match
- `not-equals` - Not equal to
- `greater-than` - Greater than (numeric/date)
- `greater-than-or-equal` - Greater than or equal
- `less-than` - Less than (numeric/date)
- `less-than-or-equal` - Less than or equal
- `contains` - String contains (case-sensitive)
- `starts-with` - String starts with
- `ends-with` - String ends with
- `in` - Value in list
- `not-in` - Value not in list

## Error Handling

The server includes robust error handling:

- **Missing environment variables**: Server won't start, clear error message shown
- **Invalid credentials**: Authentication failure with descriptive error
- **Expired tokens**: Automatic re-authentication and retry
- **Invalid datasource LUID**: Clear error message
- **Missing required fields**: Validation error before API call
- **API errors**: Tableau error messages passed through

## Troubleshooting

### Authentication Issues

If you get authentication errors:

1. Verify your PAT token is still active (tokens can be revoked)
2. Check that TABLEAU_SITE_NAME matches your actual site (check the URL)
3. Ensure your PAT has appropriate permissions (Explorer or Creator role)
4. Try creating a new PAT token

### VizQL Permission Errors (403)

If you get error **"403800: VIZQL_DATA_API_ACCESS"**:

**This means your PAT lacks VizQL Data Service permissions.** The `list_datasources` tool will still work (uses REST API), but `get_datasource_metadata` and `query_datasource` will fail.

**Solutions:**
1. Create a new PAT with "VizQL Data Service API Access" permission enabled
2. Contact your Tableau administrator to grant VizQL permissions to your existing PAT
3. Some datasources may not support VizQL - try different published datasources

**To test VizQL access:**
```bash
node test-vizql-api.js
```

This comprehensive test will identify whether the issue is permissions or datasource compatibility.

### Datasource Not Found

If a datasource LUID returns "not found":

1. Verify the LUID is correct (no typos)
2. Check that the datasource is published (not still a draft)
3. Ensure your account has permission to access that datasource
4. Use `list_datasources` to confirm available datasources

### Query Errors

If queries fail:

1. Use `get_datasource_metadata` first to verify field names
2. Check that field names match exactly (case-sensitive)
3. Ensure filter operators are valid for the field data type
4. Try reducing `max_rows` if hitting memory limits

## Development

### Testing the Server

Run the server directly to test:

```bash
npm start
```

The server runs on stdio and logs to stderr.

### Dependencies

- `@modelcontextprotocol/sdk` - MCP server framework
- `axios` - HTTP client for Tableau API calls
- `dotenv` - Environment variable management

## API Documentation

- [Tableau REST API](https://help.tableau.com/current/api/rest_api/en-us/REST/rest_api.htm)
- [VizQL Data Service API](https://help.tableau.com/current/api/vizql_data_service_api/en-us/docs/vizql_api.html)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## License

MIT
