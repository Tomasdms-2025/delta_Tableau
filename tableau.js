import axios from 'axios';

export class TableauClient {
  constructor(config) {
    this.patName = config.patName;
    this.patSecret = config.patSecret;
    this.pod = config.pod;
    this.siteName = config.siteName;
    this.apiVersion = config.apiVersion || '3.21';

    this.baseUrl = `https://${this.pod}.online.tableau.com`;
    this.token = null;
    this.siteId = null;
    this.tokenExpiry = null;
  }

  /**
   * Sign in to Tableau using Personal Access Token
   * Returns session token and site ID
   */
  async signIn() {
    try {
      const response = await axios.post(
        `${this.baseUrl}/api/${this.apiVersion}/auth/signin`,
        {
          credentials: {
            personalAccessTokenName: this.patName,
            personalAccessTokenSecret: this.patSecret,
            site: {
              contentUrl: this.siteName
            }
          }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      this.token = response.data.credentials.token;
      this.siteId = response.data.credentials.site.id;

      // Tokens typically expire after 240 minutes (4 hours)
      // Set expiry to 3.5 hours from now to be safe
      this.tokenExpiry = Date.now() + (3.5 * 60 * 60 * 1000);

      return {
        token: this.token,
        siteId: this.siteId
      };
    } catch (error) {
      throw new Error(`Tableau sign-in failed: ${error.response?.data?.error?.summary || error.message}`);
    }
  }

  /**
   * Ensure we have a valid token, refresh if needed
   */
  async ensureAuthenticated() {
    if (!this.token || !this.tokenExpiry || Date.now() >= this.tokenExpiry) {
      await this.signIn();
    }
  }

  /**
   * Get headers with auth token
   */
  async getHeaders() {
    await this.ensureAuthenticated();
    return {
      'X-Tableau-Auth': this.token,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  /**
   * List all published data sources on the site
   */
  async listDataSources() {
    try {
      const headers = await this.getHeaders();
      const response = await axios.get(
        `${this.baseUrl}/api/${this.apiVersion}/sites/${this.siteId}/datasources`,
        { headers }
      );

      return response.data.datasources.datasource.map(ds => ({
        luid: ds.id,
        name: ds.name,
        projectName: ds.project?.name,
        projectId: ds.project?.id,
        ownerName: ds.owner?.name,
        createdAt: ds.createdAt,
        updatedAt: ds.updatedAt,
        isCertified: ds.isCertified,
        description: ds.description
      }));
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, retry once
        this.token = null;
        return this.listDataSources();
      }
      throw new Error(`Failed to list data sources: ${error.response?.data?.error?.summary || error.message}`);
    }
  }

  /**
   * Get metadata (fields/schema) for a datasource
   */
  async getDataSourceMetadata(datasourceLuid) {
    if (!datasourceLuid) {
      throw new Error('datasource_luid is required');
    }

    try {
      const headers = await this.getHeaders();
      const response = await axios.post(
        `${this.baseUrl}/api/v1/vizql-data-service/read-metadata`,
        {
          datasource: {
            datasourceLuid: datasourceLuid
          }
        },
        { headers }
      );

      // Extract field information from metadata
      const metadata = response.data;
      const fields = [];

      // Parse metadata structure to extract fields
      if (metadata.data) {
        metadata.data.forEach(column => {
          fields.push({
            name: column.fieldName,
            caption: column.fieldCaption,
            dataType: column.dataType,
            role: column.fieldRole,
            fieldType: column.fieldType,
            defaultAggregation: column.defaultAggregation
          });
        });
      }

      return {
        datasourceLuid,
        fieldCount: fields.length,
        fields,
        rawMetadata: metadata
      };
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, retry once
        this.token = null;
        return this.getDataSourceMetadata(datasourceLuid);
      }
      throw new Error(`Failed to get datasource metadata: ${error.response?.data?.error?.summary || error.message}`);
    }
  }

  /**
   * Query a datasource with fields, filters, and sorts
   */
  async queryDataSource(params) {
    const { datasource_luid, fields, filters, sorts, max_rows } = params;

    if (!datasource_luid) {
      throw new Error('datasource_luid is required');
    }

    if (!fields || fields.length === 0) {
      throw new Error('At least one field is required');
    }

    try {
      const headers = await this.getHeaders();

      // Build query request
      const queryRequest = {
        datasource: {
          datasourceLuid: datasource_luid
        },
        query: {
          fields: fields.map(field => ({ fieldCaption: field }))
        }
      };

      // Add filters if provided
      if (filters && filters.length > 0) {
        queryRequest.query.filters = filters.map(filter => ({
          fieldCaption: filter.field,
          operator: filter.operator,
          values: filter.values
        }));
      }

      // Add sorts if provided
      if (sorts && sorts.length > 0) {
        queryRequest.query.sorts = sorts.map(sort => ({
          fieldCaption: sort.field,
          direction: sort.direction
        }));
      }

      const response = await axios.post(
        `${this.baseUrl}/api/v1/vizql-data-service/query-datasource`,
        queryRequest,
        { headers }
      );

      // Parse and format the response
      const responseData = response.data;

      // Limit rows if max_rows is specified (API doesn't support limit parameter)
      let rows = responseData.data || [];
      if (max_rows && rows.length > max_rows) {
        rows = rows.slice(0, max_rows);
      }

      return {
        datasourceLuid: datasource_luid,
        rowCount: rows.length,
        totalRows: responseData.data?.length || 0,
        fields,
        rows,
        truncated: max_rows && responseData.data?.length > max_rows
      };
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, retry once
        this.token = null;
        return this.queryDataSource(params);
      }
      throw new Error(`Failed to query datasource: ${error.response?.data?.error?.summary || error.message}`);
    }
  }
}
