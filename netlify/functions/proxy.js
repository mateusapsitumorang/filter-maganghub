// File: netlify/functions/proxy.js

// Global cache - akan di-populate secara bertahap
const globalCache = {
  allData: [],
  lastFetchedPage: 0,
  totalPages: 0,
  isComplete: false,
  lastUpdate: null,
  isFetching: false
};

const CACHE_DURATION = 30 * 60 * 1000; // 30 menit

exports.handler = async (event, context) => {
  const { 
    page = 1, 
    location = '',
    major = '',
    search = '',
    sort_kuota = '',
    sort_waktu = '',
    order_by = 'jumlah_kuota', 
    order_direction = 'DESC'
  } = event.queryStringParameters || {};
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    const hasFilters = location || major || search;
    
    if (hasFilters) {
      console.log('Filters detected:', { location, major, search, sort_kuota, sort_waktu, page });
      
      const now = Date.now();
      
      // Check if cache is still valid
      const cacheValid = globalCache.lastUpdate && (now - globalCache.lastUpdate < CACHE_DURATION);
      
      // Jika cache kosong atau expired, fetch ulang dari awal
      if (!cacheValid || globalCache.allData.length === 0) {
        console.log('Cache expired or empty, starting fresh fetch...');
        globalCache.allData = [];
        globalCache.lastFetchedPage = 0;
        globalCache.isComplete = false;
        globalCache.lastUpdate = now;
      }
      
      // Fetch data jika belum complete dan tidak sedang fetching
      if (!globalCache.isComplete && !globalCache.isFetching) {
        globalCache.isFetching = true;
        
        try {
          // Tentukan halaman mana yang akan di-fetch
          const startPage = globalCache.lastFetchedPage + 1;
          
          // Fetch halaman pertama untuk mendapatkan total pages
          if (startPage === 1) {
            const firstUrl = `https://maganghub.kemnaker.go.id/be/v1/api/list/vacancies-aktif?order_by=${order_by}&order_direction=${order_direction}&limit=100&page=1`;
            
            const firstResponse = await fetch(firstUrl, {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
              }
            });
            
            if (firstResponse.ok) {
              const firstData = await firstResponse.json();
              globalCache.totalPages = firstData.meta?.pagination?.last_page || 1;
              globalCache.allData = firstData.data || [];
              globalCache.lastFetchedPage = 1;
              console.log(`First page fetched. Total pages: ${globalCache.totalPages}`);
            }
          }
          
          // Fetch batch berikutnya (maksimal 30 halaman per call untuk avoid timeout)
          const maxPagesToFetch = Math.min(startPage + 5000, globalCache.totalPages); // Fetch 30 halaman
          const batchSize = 10;
          
          for (let batchStart = startPage + 1; batchStart <= maxPagesToFetch; batchStart += batchSize) {
            const batchEnd = Math.min(batchStart + batchSize - 1, maxPagesToFetch);
            console.log(`Fetching batch: pages ${batchStart} to ${batchEnd}`);
            
            const batchPromises = [];
            for (let i = batchStart; i <= batchEnd; i++) {
              const url = `https://maganghub.kemnaker.go.id/be/v1/api/list/vacancies-aktif?order_by=${order_by}&order_direction=${order_direction}&limit=100&page=${i}`;
              
              const promise = fetch(url, {
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0'
                }
              })
              .then(res => res.ok ? res.json() : null)
              .catch(() => null);
              
              batchPromises.push(promise);
            }
            
            const batchResults = await Promise.all(batchPromises);
            
            batchResults.forEach((data) => {
              if (data && data.data && Array.isArray(data.data)) {
                globalCache.allData = globalCache.allData.concat(data.data);
              }
            });
            
            globalCache.lastFetchedPage = batchEnd;
          }
          
          // Check jika sudah complete
          if (globalCache.lastFetchedPage >= globalCache.totalPages) {
            globalCache.isComplete = true;
            console.log(`Fetch complete! Total items: ${globalCache.allData.length}`);
          } else {
            console.log(`Fetched up to page ${globalCache.lastFetchedPage}/${globalCache.totalPages}. Will continue on next request.`);
          }
          
        } finally {
          globalCache.isFetching = false;
        }
      }
      
      // Filter data yang sudah di-fetch
      let filteredVacancies = globalCache.allData;
      
      if (location) {
        const locationLower = location.toLowerCase().trim();
        filteredVacancies = filteredVacancies.filter(vacancy => {
          const addr = (vacancy.perusahaan?.alamat || '').toLowerCase();
          const prov = (vacancy.perusahaan?.nama_provinsi || '').toLowerCase();
          const city = (vacancy.perusahaan?.nama_kabupaten || '').toLowerCase();
          return addr.includes(locationLower) || 
                 prov.includes(locationLower) || 
                 city.includes(locationLower);
        });
      }
      
      if (major) {
        const majorLower = major.toLowerCase().trim();
        filteredVacancies = filteredVacancies.filter(vacancy => {
          try {
            const programStudi = JSON.parse(vacancy.program_studi || '[]');
            return programStudi.some(ps => 
              (ps.title || '').toLowerCase().includes(majorLower)
            );
          } catch (e) {
            return false;
          }
        });
      }
      
      if (search) {
        const searchLower = search.toLowerCase().trim();
        filteredVacancies = filteredVacancies.filter(vacancy => {
          const posisi = (vacancy.posisi || '').toLowerCase();
          const perusahaan = (vacancy.perusahaan?.nama_perusahaan || '').toLowerCase();
          const deskripsi = (vacancy.deskripsi_posisi || '').toLowerCase();
          
          let majorsText = '';
          try {
            const programStudi = JSON.parse(vacancy.program_studi || '[]');
            majorsText = programStudi.map(ps => ps.title || '').join(' ').toLowerCase();
          } catch (e) {
            majorsText = '';
          }
          
          return posisi.includes(searchLower) || 
                 perusahaan.includes(searchLower) || 
                 deskripsi.includes(searchLower) ||
                 majorsText.includes(searchLower);
        });
      }
      
      console.log(`Filtered results: ${filteredVacancies.length} from ${globalCache.allData.length} total items`);
      
      // Sort data berdasarkan pilihan (bisa dual sorting)
      filteredVacancies.sort((a, b) => {
        // Primary sort: Waktu (jika dipilih)
        if (sort_waktu) {
          const dateA = new Date(a.created_at || 0);
          const dateB = new Date(b.created_at || 0);
          const waktuCompare = sort_waktu === 'desc' ? dateB - dateA : dateA - dateB;
          
          // Jika waktu berbeda, return hasil compare
          if (waktuCompare !== 0) return waktuCompare;
        }
        
        // Secondary sort: Kuota (jika dipilih atau sebagai tiebreaker)
        if (sort_kuota || !sort_waktu) {
          const kuotaA = parseInt(a.jumlah_kuota) || 0;
          const kuotaB = parseInt(b.jumlah_kuota) || 0;
          const kuotaDirection = sort_kuota || 'desc'; // Default desc jika tidak ada yang dipilih
          return kuotaDirection === 'desc' ? kuotaB - kuotaA : kuotaA - kuotaB;
        }
        
        return 0;
      });
      
      // Paginate
      const limit = 500;
      const currentPage = parseInt(page);
      const total = filteredVacancies.length;
      const totalFilteredPages = Math.ceil(total / limit) || 1;
      const startIndex = (currentPage - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedData = filteredVacancies.slice(startIndex, endIndex);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          data: paginatedData,
          meta: {
            pagination: {
              current_page: currentPage,
              last_page: totalFilteredPages,
              per_page: limit,
              total: total,
            },
            cache_info: {
              fetched_pages: `${globalCache.lastFetchedPage}/${globalCache.totalPages}`,
              fetched_items: globalCache.allData.length,
              is_complete: globalCache.isComplete,
              message: globalCache.isComplete 
                ? 'Semua data telah dimuat' 
                : `Memuat data... ${globalCache.lastFetchedPage}/${globalCache.totalPages} halaman. Refresh untuk data lebih lengkap.`
            }
          }
        }),
      };
      
    } else {
      // No filters - proxy original API
      const url = `https://maganghub.kemnaker.go.id/be/v1/api/list/vacancies-aktif?order_by=${order_by}&order_direction=${order_direction}&limit=100&page=${page}`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data),
      };
    }
    
  } catch (error) {
    console.error('Proxy error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to fetch data',
        message: error.message,
        tip: 'Data sedang dimuat secara bertahap. Silakan refresh halaman beberapa kali untuk mendapatkan data yang lebih lengkap.'
      }),
    };
  }
};