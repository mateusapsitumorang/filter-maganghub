// File: netlify/functions/proxy.js

// Global cache - akan di-populate secara bertahap
const globalCache = {
  allData: [],
  lastFetchedPage: 0,
  totalPages: 0,
  isComplete: false,
  lastUpdate: null,
  isFetching: false,
  fetchStartTime: null
};

const CACHE_DURATION = 60 * 60 * 1000; // 60 menit
const MAX_EXECUTION_TIME = 8000; // 8 detik untuk safety (Netlify limit 10s)

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Handle login proxy (updated endpoint)
  if (event.path.includes('/login')) {
    try {
      const { username, password } = JSON.parse(event.body); // Updated to username
      const response = await fetch('https://account.kemnaker.go.id/login', { // Updated to /login
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const text = await response.text(); // Read as text first
      let data;
      try {
        data = JSON.parse(text); // Try parse
      } catch {
        data = { error: 'Non-JSON response', raw: text };
      }
      return { statusCode: response.status, headers, body: JSON.stringify(data) };
    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
  }
  
  try {
    const hasFilters = location || major || search;
    
    if (hasFilters) {
      console.log('Filters detected:', { location, major, search, sort_kuota, sort_waktu, page });
      
      const now = Date.now();
      
      // Check if cache is still valid
      const cacheValid = globalCache.lastUpdate && (now - globalCache.lastUpdate < CACHE_DURATION);
      
      // Jika cache kosong atau expired, reset
      if (!cacheValid || globalCache.allData.length === 0) {
        console.log('Cache expired or empty, resetting...');
        globalCache.allData = [];
        globalCache.lastFetchedPage = 0;
        globalCache.isComplete = false;
        globalCache.lastUpdate = now;
      }
      
      // Fetch data secara bertahap dengan time limit
      if (!globalCache.isComplete && !globalCache.isFetching) {
        globalCache.isFetching = true;
        globalCache.fetchStartTime = Date.now();
        
        try {
          // Fetch halaman pertama untuk mendapatkan total pages
          if (globalCache.lastFetchedPage === 0) {
            const firstUrl = `https://maganghub.kemnaker.go.id/be/v1/api/list/vacancies-aktif?order_by=${order_by}&order_direction=${order_direction}&limit=100&page=1`;
            
            console.log('Fetching first page...');
            const firstResponse = await fetch(firstUrl, {
              headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0'
              },
              signal: AbortSignal.timeout(5000)
            });
            
            if (firstResponse.ok) {
              const firstData = await firstResponse.json();
              globalCache.totalPages = firstData.meta?.pagination?.last_page || 1;
              globalCache.allData = firstData.data || [];
              globalCache.lastFetchedPage = 1;
              console.log(`First page fetched. Total pages: ${globalCache.totalPages}, Total items in page 1: ${globalCache.allData.length}`);
            }
          }
          
          // Fetch batch berikutnya dengan time limit
          const startPage = globalCache.lastFetchedPage + 1;
          const batchSize = 3; // Fetch 3 halaman parallel
          let pagesFetched = 0;
          
          // Loop sampai timeout atau selesai
          while (startPage + pagesFetched <= globalCache.totalPages) {
            const elapsedTime = Date.now() - globalCache.fetchStartTime;
            
            // Stop jika mendekati timeout
            if (elapsedTime > MAX_EXECUTION_TIME) {
              console.log(`Stopping due to time limit. Elapsed: ${elapsedTime}ms`);
              break;
            }
            
            const batchStart = startPage + pagesFetched;
            const batchEnd = Math.min(batchStart + batchSize - 1, globalCache.totalPages);
            
            console.log(`Fetching pages ${batchStart}-${batchEnd} (${elapsedTime}ms elapsed)`);
            
            const batchPromises = [];
            for (let i = batchStart; i <= batchEnd; i++) {
              const url = `https://maganghub.kemnaker.go.id/be/v1/api/list/vacancies-aktif?order_by=${order_by}&order_direction=${order_direction}&limit=100&page=${i}`;
              
              const promise = fetch(url, {
                headers: {
                  'Accept': 'application/json',
                  'User-Agent': 'Mozilla/5.0'
                },
                signal: AbortSignal.timeout(5000)
              })
              .then(res => res.ok ? res.json() : null)
              .catch((err) => {
                console.error(`Failed page ${i}:`, err.message);
                return null;
              });
              
              batchPromises.push(promise);
            }
            
            const batchResults = await Promise.all(batchPromises);
            
            let itemsAdded = 0;
            batchResults.forEach((data) => {
              if (data && data.data && Array.isArray(data.data)) {
                globalCache.allData = globalCache.allData.concat(data.data);
                itemsAdded += data.data.length;
              }
            });
            
            globalCache.lastFetchedPage = batchEnd;
            pagesFetched = batchEnd - startPage + 1;
            
            console.log(`Batch complete. Added ${itemsAdded} items. Total: ${globalCache.allData.length}`);
            
            // Check jika sudah selesai semua
            if (globalCache.lastFetchedPage >= globalCache.totalPages) {
              globalCache.isComplete = true;
              console.log(`✅ ALL DATA FETCHED! Total: ${globalCache.allData.length} items from ${globalCache.totalPages} pages`);
              break;
            }
          }
          
        } catch (error) {
          console.error('Fetch error:', error);
        } finally {
          globalCache.isFetching = false;
        }
      }
      
      // Filter data yang sudah di-fetch
      let filteredVacancies = [...globalCache.allData];
      
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
      
      console.log(`Filtered: ${filteredVacancies.length} from ${globalCache.allData.length} total`);
      
      // Sort data
      filteredVacancies.sort((a, b) => {
        if (sort_waktu) {
          const dateA = new Date(a.created_at || 0);
          const dateB = new Date(b.created_at || 0);
          const waktuCompare = sort_waktu === 'desc' ? dateB - dateA : dateA - dateB;
          if (waktuCompare !== 0) return waktuCompare;
        }
        
        if (sort_kuota || !sort_waktu) {
          const kuotaA = parseInt(a.jumlah_kuota) || 0;
          const kuotaB = parseInt(b.jumlah_kuota) || 0;
          const kuotaDirection = sort_kuota || 'desc';
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
      
      const progressPercentage = globalCache.totalPages > 0 
        ? Math.round((globalCache.lastFetchedPage / globalCache.totalPages) * 100) 
        : 0;
      
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
              fetched_pages: globalCache.lastFetchedPage,
              total_pages: globalCache.totalPages,
              fetched_items: globalCache.allData.length,
              is_complete: globalCache.isComplete,
              progress_percentage: progressPercentage,
              is_fetching: globalCache.isFetching,
              message: globalCache.isComplete 
                ? '✅ Semua data telah dimuat!' 
                : `⏳ Memuat data... ${progressPercentage}% (${globalCache.lastFetchedPage}/${globalCache.totalPages} halaman). Refresh otomatis berjalan...`
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
        },
        signal: AbortSignal.timeout(5000)
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
        cache_info: {
          fetched_pages: globalCache.lastFetchedPage,
          total_pages: globalCache.totalPages,
          fetched_items: globalCache.allData.length
        }
      }),
    };
  }
};