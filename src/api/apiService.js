import axios from 'axios';

const BASE_URL = 'https://hdgu.vishvin.com/mobile-app/api';

export const fetchSectionCodes = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/section_codes`);
    
    if (response.data && response.data.data && Array.isArray(response.data.data)) {
      return response.data.data;
    } else {
      console.warn('Unexpected or empty section codes data format');
      return [];
    }
  } catch (error) {
    console.error('Error fetching section codes:', error);
    throw error;
  }
};

export const fetchSectionCustomers = async (sectionCode) => {
  try {
    console.log('Fetching customers for section:', sectionCode);
    const response = await axios.get(`${BASE_URL}/section/fetch`, {
      params: { so_pincode: sectionCode }
    });
    console.log('Raw section customers response:', JSON.stringify(response.data, null, 2));

    if (response.data && response.data.status) {
      return response.data.data || [];
    } else {
      throw new Error('Invalid response format');
    }
  } catch (error) {
    console.error('Error fetching section customers:', error.response ? error.response.data : error.message);
    throw error;
  }
};

export const fetchInstalledRecords = async (userId) => {
  try {
    const response = await axios.get(`${BASE_URL}/installed_records/${userId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching installed records:', error);
    throw error;
  }
};

