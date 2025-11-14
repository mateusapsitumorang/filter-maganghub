import React, { useState, useEffect } from 'react';
import { MapPin, GraduationCap, Users, Briefcase, Search, Menu, X, ChevronLeft, ChevronRight, LogIn } from 'lucide-react';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
 
  // Input states (for immediate UI update)
  const [daerahInput, setDaerahInput] = useState('');
  const [jurusanInput, setJurusanInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
 
  // Filter states (for actual API call - debounced)
  const [daerah, setDaerah] = useState('');
  const [jurusan, setJurusan] = useState('');
  const [search, setSearch] = useState('');
  const [sortByKuota, setSortByKuota] = useState('desc'); // 'desc', 'asc', or ''
  const [sortByWaktu, setSortByWaktu] = useState(''); // 'desc', 'asc', or ''
 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // New states for authentication and profile
  const [token, setToken] = useState(localStorage.getItem('maganghub_token') || null);
  const [userProfile, setUserProfile] = useState(null); // { pendidikan: [], pelatihan: [], sertifikasi: [], etc }
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState(''); // Changed from email to username
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState(null);
 
  // Debounce untuk daerah
  useEffect(() => {
    const timer = setTimeout(() => {
      setDaerah(daerahInput);
      setCurrentPage(1);
    }, 800);
    return () => clearTimeout(timer);
  }, [daerahInput]);
 
  // Debounce untuk jurusan
  useEffect(() => {
    const timer = setTimeout(() => {
      setJurusan(jurusanInput);
      setCurrentPage(1);
    }, 800);
    return () => clearTimeout(timer);
  }, [jurusanInput]);
 
  // Debounce untuk search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setCurrentPage(1);
    }, 800);
    return () => clearTimeout(timer);
  }, [searchInput]);
 
  const parseMajors = (program_studi_str) => {
    try {
      const majors_list = JSON.parse(program_studi_str);
      return majors_list.map(major => major.title).join(', ') || 'N/A';
    } catch (e) {
      return 'N/A';
    }
  };
 
  const parseJenjang = (jenjang_str) => {
    try {
      return JSON.parse(jenjang_str).join(', ') || 'N/A';
    } catch (e) {
      return 'N/A';
    }
  };

  // New function to calculate match percentage
  const calculateMatchPercentage = (item) => {
    if (!userProfile) return 0;

    let percentage = 0;

    // Extract user data
    const userMajors = userProfile.pendidikan?.map(p => p.jurusan?.toLowerCase()) || [];
    const userJenjang = userProfile.pendidikan?.map(p => p.jenjang?.toLowerCase()) || [];
    const userSkills = [...(userProfile.pelatihan || []), ...(userProfile.sertifikasi || [])].map(s => s.title?.toLowerCase()) || [];
    const userLocation = userProfile.location?.toLowerCase() || '';

    // Match jurusan (50%)
    const itemMajors = parseMajors(item.Jurusan || '[]').toLowerCase().split(', ');
    const majorMatch = itemMajors.some(im => userMajors.includes(im));
    if (majorMatch) percentage += 50;

    // Match jenjang (20%)
    const itemJenjang = parseJenjang(item.Jenjang || '[]').toLowerCase().split(', ');
    const jenjangMatch = itemJenjang.some(ij => userJenjang.includes(ij));
    if (jenjangMatch) percentage += 20;

    // Match location (10%)
    if (item.Lokasi.toLowerCase().includes(userLocation)) percentage += 10;

    // Keyword overlap in deskripsi (20% max, 5% per match, up to 4)
    const deskripsiLower = item['Deskripsi Posisi'].toLowerCase();
    let keywordCount = 0;
    userSkills.forEach(skill => {
      if (deskripsiLower.includes(skill)) keywordCount++;
    });
    percentage += Math.min(keywordCount * 5, 20);

    return Math.min(percentage, 100);
  };
 
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const baseUrl = '/.netlify/functions/proxy';
      try {
        let queryParams = `page=${currentPage}`;
        if (daerah) {
          queryParams += `&location=${encodeURIComponent(daerah)}`;
        }
        if (jurusan) {
          queryParams += `&major=${encodeURIComponent(jurusan)}`;
        }
        if (search) {
          queryParams += `&search=${encodeURIComponent(search)}`;
        }
        if (sortByKuota) {
          queryParams += `&sort_kuota=${sortByKuota}`;
        }
        if (sortByWaktu) {
          queryParams += `&sort_waktu=${sortByWaktu}`;
        }
        const response = await fetch(`${baseUrl}?${queryParams}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        const vacancies = result.data || [];
        const pageData = vacancies.map(vacancy => {
          const title = vacancy.posisi || 'N/A';
          const company = vacancy.perusahaan?.nama_perusahaan || 'N/A';
          const location = vacancy.perusahaan?.alamat || 'N/A';
          const province = vacancy.perusahaan?.nama_provinsi || 'N/A';
          const city = vacancy.perusahaan?.nama_kabupaten || 'N/A';
          const fullLocation = `${location}, ${city}, ${province}`;
          const majors = parseMajors(vacancy.program_studi || '[]');
          const deskripsi = vacancy.deskripsi_posisi || 'N/A';
          const govAgency = vacancy.government_agency?.government_agency_name || 'Tidak ada';
          const subGovAgency = vacancy.sub_government_agency?.sub_government_agency_name || 'Tidak ada';
          const jenjang = parseJenjang(vacancy.jenjang || '[]');
          const kuota = vacancy.jumlah_kuota || 'N/A';
          const terdaftar = vacancy.jumlah_terdaftar || 'N/A';
          return {
            Judul: title,
            Perusahaan: company,
            Lokasi: fullLocation,
            Jurusan: majors,
            'Deskripsi Posisi': deskripsi,
            'Government Agency Name': govAgency,
            'Sub Government Agency Name': subGovAgency,
            Jenjang: jenjang,
            'Jumlah Kuota': kuota,
            'Jumlah Terdaftar': terdaftar,
            matchPercentage: calculateMatchPercentage({
              Judul: title,
              Perusahaan: company,
              Lokasi: fullLocation,
              Jurusan: majors,
              'Deskripsi Posisi': deskripsi,
              Jenjang: jenjang,
            }),
          };
        });
        setData(pageData);
        setFilteredData(pageData);
       
        const meta = result.meta?.pagination || {};
        setTotalPages(meta.last_page || 1);
        setTotalItems(meta.total || 0);
       
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentPage, daerah, jurusan, search, sortByKuota, sortByWaktu, userProfile]);

  // Fetch profile after login
  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) return;

      try {
        // Assume user ID from token or fetch /me first. Replace with actual logic.
        const userId = 'b598893b-1f74-4a9a-a9ac-d0026eecfca3'; // Ganti dengan real user ID dari response login atau /me

        // Fetch pendidikan
        const pendidikanRes = await fetch(`https://maganghub.kemnaker.go.id/be/v1/api/list/portofolio-pendidikan?id=${userId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!pendidikanRes.ok) {
          throw new Error('Failed to fetch pendidikan');
        }
        const pendidikanData = await pendidikanRes.json();

        // Fetch pelatihan (adjust endpoint if different)
        const pelatihanRes = await fetch(`https://maganghub.kemnaker.go.id/be/v1/api/list/portofolio-pelatihan?id=${userId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!pelatihanRes.ok) {
          throw new Error('Failed to fetch pelatihan');
        }
        const pelatihanData = await pelatihanRes.json();

        // Fetch sertifikasi (adjust endpoint if different)
        const sertifikasiRes = await fetch(`https://maganghub.kemnaker.go.id/be/v1/api/list/portofolio-sertifikasi?id=${userId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!sertifikasiRes.ok) {
          throw new Error('Failed to fetch sertifikasi');
        }
        const sertifikasiData = await sertifikasiRes.json();

        if (pendidikanData.failed || pelatihanData.failed || sertifikasiData.failed) {
          throw new Error('Akses ditolak atau data kosong');
        }

        setUserProfile({
          pendidikan: pendidikanData.data || [],
          pelatihan: pelatihanData.data || [],
          sertifikasi: sertifikasiData.data || [],
          // Add location if available from another endpoint
        });
      } catch (err) {
        setError(err.message);
        setToken(null);
        localStorage.removeItem('maganghub_token');
        setLoginModalOpen(true); // Redirect to login if failed
      }
    };

    fetchProfile();
  }, [token]);
 
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };
 
  const handleFilterApply = () => {
    setDaerah(daerahInput);
    setJurusan(jurusanInput);
    setSearch(searchInput);
    setCurrentPage(1);
  };
 
  const handleKuotaChange = (direction) => {
    if (sortByKuota === direction) {
      setSortByKuota(''); // Uncheck if already selected
    } else {
      setSortByKuota(direction);
    }
    setCurrentPage(1);
  };
 
  const handleWaktuChange = (direction) => {
    if (sortByWaktu === direction) {
      setSortByWaktu(''); // Uncheck if already selected
    } else {
      setSortByWaktu(direction);
    }
    setCurrentPage(1);
  };

  // Handle login with better error handling
  const handleLogin = async () => {
    setLoginError(null);
    try {
      const response = await fetch('https://account.kemnaker.go.id/login', { // Updated to /login
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }), // Changed to username
      });
      const text = await response.text(); // Read as text first
      let result;
      try {
        result = JSON.parse(text);
      } catch (e) {
        throw new Error(`Invalid JSON response: ${text.substring(0, 100)}... (likely HTML page, check endpoint)`);
      }
      if (!response.ok) {
        throw new Error(`Login failed: ${response.status} - ${result.message || text}`);
      }
      if (result.failed) {
        throw new Error(result.failed || 'Login gagal');
      }
      const newToken = result.token; // Assume 'token' field
      setToken(newToken);
      localStorage.setItem('maganghub_token', newToken);
      setLoginModalOpen(false);
      // If response has user ID, set it here for profile fetch
    } catch (err) {
      setLoginError(err.message);
    }
  };
 
  const renderPagination = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return (
      <div className="flex items-center justify-center gap-2 mt-8">
        <button
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {startPage > 1 && (
          <>
            <button
              onClick={() => handlePageChange(1)}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
            >
              1
            </button>
            {startPage > 2 && <span className="px-2">...</span>}
          </>
        )}
        {pages.map(page => (
          <button
            key={page}
            onClick={() => handlePageChange(page)}
            className={`px-4 py-2 rounded-lg border transition ${
              currentPage === page
                ? 'bg-black text-white border-black'
                : 'border-gray-300 hover:bg-gray-50'
            }`}
          >
            {page}
          </button>
        ))}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-2">...</span>}
            <button
              onClick={() => handlePageChange(totalPages)}
              className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition"
            >
              {totalPages}
            </button>
          </>
        )}
        <button
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    );
  };
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Modern Navbar */}
      <nav className="bg-white shadow-lg sticky top-0 z-50 backdrop-blur-lg bg-opacity-90">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex items-center space-x-2">
                <img src="/images/Logo Filter Maganghub.png" alt="Logo Filter Maganghub" className="h-8 w-8 object-cover" />
                <span className="text-2xl font-bold text-[#191b19]">Filter Maganghub</span>
              </div>
            </div>
            {/* Desktop Menu */}
            <div className="hidden md:flex items-center space-x-8">
              <a href="https://maganghub.kemnaker.go.id/" className="text-gray-700 hover:text-black transition-colors duration-300 font-medium">Beranda</a>
              <a href="https://maganghub.kemnaker.go.id/lowongan" className="text-gray-700 hover:text-black transition-colors duration-300 font-medium">Lowongan</a>
              <a href="https://maganghub.kemnaker.go.id/login" target="_blank" rel="noopener noreferrer">
                <button className="bg-[#191b19] text-white px-6 py-2 rounded-full hover:shadow-lg transition transform hover:scale-105">
                  Masuk
                </button>
              </a>
              {token ? (
                <button onClick={() => { setToken(null); localStorage.removeItem('maganghub_token'); }} className="text-gray-700 hover:text-black">
                  Logout
                </button>
              ) : (
                <button onClick={() => setLoginModalOpen(true)} className="text-gray-700 hover:text-black">
                  <LogIn className="h-5 w-5 inline mr-1" /> Login for Profile Match
                </button>
              )}
            </div>
            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-gray-700">
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden pb-4">
              <a href="https://maganghub.kemnaker.go.id/" className="block py-2 text-gray-700 hover:text-black transition-colors duration-300 font-medium">Beranda</a>
              <a href="https://maganghub.kemnaker.go.id/lowongan" className="block py-2 text-gray-700 hover:text-black transition-colors duration-300 font-medium">Lowongan</a>
              <a href="https://maganghub.kemnaker.go.id/login" target="_blank" rel="noopener noreferrer">
                <button className="bg-[#191b19] text-white px-6 py-2 rounded-full hover:shadow-lg transition transform hover:scale-105 mt-2">
                  Masuk
                </button>
              </a>
              {token ? (
                <button onClick={() => { setToken(null); localStorage.removeItem('maganghub_token'); }} className="block py-2 text-gray-700 hover:text-black">
                  Logout
                </button>
              ) : (
                <button onClick={() => setLoginModalOpen(true)} className="block py-2 text-gray-700 hover:text-black">
                  Login for Profile Match
                </button>
              )}
            </div>
          )}
        </div>
      </nav>
      {/* Hero Section */}
      <div className="text-white py-16" style={{
        backgroundImage: 'url("/images/Background.png")',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Filter Maganghub</h1>
          <p className="text-xl text-blue-100 mb-8">Temukan lowongan magang sesuai jurusan dan lokasi Anda</p>
         
          {/* Search Bar */}
          <div className="max-w-3xl mx-auto">
            <div className="bg-white rounded-2xl shadow-2xl p-2 flex items-center">
              <Search className="h-6 w-6 text-gray-400 ml-4" />
              <input
                type="text"
                placeholder="Cari posisi, perusahaan, atau kata kunci lainnya..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleFilterApply()}
                className="flex-1 px-4 py-3 text-gray-700 focus:outline-none"
              />
              <button
                onClick={handleFilterApply}
                className="bg-[#191b19] text-white px-6 py-2 rounded-full hover:shadow-lg transition transform hover:scale-105">
                Cari
              </button>
            </div>
          </div>
        </div>
      </div>
      {/* Filter Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Filter Berdasarkan Daerah
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={daerahInput}
                  onChange={(e) => setDaerahInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleFilterApply()}
                  placeholder="Contoh: DKI Jakarta, Bandung, Surabaya..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Filter Berdasarkan Jurusan
              </label>
              <div className="relative">
                <GraduationCap className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={jurusanInput}
                  onChange={(e) => setJurusanInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleFilterApply()}
                  placeholder="Contoh: Teknologi Pangan, Teknik Informatika..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleFilterApply}
              className="bg-[#191b19] text-white px-8 py-2 rounded-xl hover:shadow-lg transition transform hover:scale-105"
            >
              Terapkan Filter
            </button>
          </div>
        </div>
      </div>
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading && (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-black"></div>
            <p className="mt-4 text-xl text-gray-600">Memuat data lowongan...</p>
            <p className="mt-2 text-sm text-gray-500">Mohon tunggu, proses filtering mungkin membutuhkan waktu</p>
          </div>
        )}
       
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
            <p className="text-red-700 font-medium">Error: {error}</p>
            <p className="text-red-600 text-sm mt-2">Silakan coba lagi atau refresh halaman</p>
          </div>
        )}
       
        {!loading && !error && (
          <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                {totalItems} Lowongan Ditemukan (Halaman {currentPage} dari {totalPages})
              </h2>
             
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <span className="text-sm text-gray-600 font-medium">Urutkan:</span>
               
                {/* Kuota Sorting */}
                <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-lg">
                  <span className="text-xs font-semibold text-gray-700">Berdasarkan Kuota:</span>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sortByKuota === 'desc'}
                        onChange={() => handleKuotaChange('desc')}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Terbanyak</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sortByKuota === 'asc'}
                        onChange={() => handleKuotaChange('asc')}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Tersedikit</span>
                    </label>
                  </div>
                </div>
                {/* Waktu Sorting */}
                <div className="flex flex-col gap-2 bg-gray-50 p-3 rounded-lg">
                  <span className="text-xs font-semibold text-gray-700">Berdasarkan Waktu:</span>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sortByWaktu === 'desc'}
                        onChange={() => handleWaktuChange('desc')}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Terbaru</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sortByWaktu === 'asc'}
                        onChange={() => handleWaktuChange('asc')}
                        className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Terlama</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredData.map((item, index) => (
                <div key={index} className="bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-2 overflow-hidden">
                  <div className="bg-black h-2"></div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-gray-800 mb-2 line-clamp-2">
                      {item.Judul}
                    </h3>
                    <p className="text-gray-600 font-medium mb-4">{item.Perusahaan}</p>
                   
                    <div className="space-y-3 mb-4">
                      <div className="flex items-start text-sm text-gray-600">
                        <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-blue-500" />
                        <span className="line-clamp-2">{item.Lokasi}</span>
                      </div>
                      <div className="flex items-start text-sm text-gray-600">
                        <GraduationCap className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-purple-500" />
                        <span>{item.Jenjang}</span>
                      </div>
                      <div className="flex items-start text-sm text-gray-600">
                        <Briefcase className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0 text-green-500" />
                        <span className="line-clamp-2">{item.Jurusan}</span>
                      </div>
                    </div>
                   
                    <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                      {item['Deskripsi Posisi']}
                    </p>
                   
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center text-sm">
                        <Users className="h-4 w-4 mr-1 text-blue-500" />
                        <span className="text-gray-600">
                          <span className="font-semibold text-gray-800">{item['Jumlah Kuota']}</span> kuota
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        <span className="font-semibold text-gray-800">{item['Jumlah Terdaftar']}</span> terdaftar
                      </div>
                      {userProfile && (
                        <div className="text-sm text-green-600 font-bold">
                          Peluang Match: {item.matchPercentage}%
                        </div>
                      )}
                    </div>
                   
                    <button
                      onClick={() => setSelectedItem(item)}
                      className="mt-4 w-full bg-black text-white py-3 rounded-xl font-medium hover:shadow-lg transition transform hover:scale-105"
                    >
                      Lihat Detail
                    </button>
                  </div>
                </div>
              ))}
            </div>
           
            {filteredData.length === 0 && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">🔍</div>
                <h3 className="text-2xl font-bold text-gray-800 mb-2">
                  Tidak Ada Lowongan Ditemukan
                </h3>
                <p className="text-gray-600">
                  Coba ubah filter pencarian Anda atau hapus beberapa kriteria
                </p>
              </div>
            )}
            {filteredData.length > 0 && renderPagination()}
          </>
        )}
      </div>
      {/* Modal Detail */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedItem(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-black text-white p-6 rounded-t-2xl flex justify-between items-center">
              <h2 className="text-2xl font-bold">Detail Lowongan</h2>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-white hover:text-gray-300 transition"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
           
            <div className="p-8">
              <h3 className="text-3xl font-bold text-gray-800 mb-2">
                {selectedItem.Judul}
              </h3>
              <p className="text-xl text-gray-600 font-medium mb-6">{selectedItem.Perusahaan}</p>
             
              <div className="space-y-4 mb-6">
                <div className="flex items-start p-4 bg-blue-50 rounded-xl">
                  <MapPin className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0 text-blue-500" />
                  <div>
                    <p className="font-semibold text-gray-800">Lokasi</p>
                    <p className="text-gray-600">{selectedItem.Lokasi}</p>
                  </div>
                </div>
               
                <div className="flex items-start p-4 bg-purple-50 rounded-xl">
                  <GraduationCap className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0 text-purple-500" />
                  <div>
                    <p className="font-semibold text-gray-800">Jenjang Pendidikan</p>
                    <p className="text-gray-600">{selectedItem.Jenjang}</p>
                  </div>
                </div>
               
                <div className="flex items-start p-4 bg-green-50 rounded-xl">
                  <Briefcase className="h-5 w-5 mr-3 mt-0.5 flex-shrink-0 text-green-500" />
                  <div>
                    <p className="font-semibold text-gray-800">Jurusan</p>
                    <p className="text-gray-600">{selectedItem.Jurusan}</p>
                  </div>
                </div>
              </div>
             
              <div className="mb-6">
                <h4 className="text-xl font-bold text-gray-800 mb-3">Deskripsi Posisi</h4>
                <p className="text-gray-600 leading-relaxed whitespace-pre-line">
                  {selectedItem['Deskripsi Posisi']}
                </p>
              </div>
             
              <div className="mb-6">
                <h4 className="text-xl font-bold text-gray-800 mb-3">Informasi Instansi</h4>
                <div className="space-y-2">
                  <p className="text-gray-600">
                    <span className="font-semibold">Nama Instansi Pemerintah:</span> {selectedItem['Government Agency Name']}
                  </p>
                  <p className="text-gray-600">
                    <span className="font-semibold">Nama Sub Instansi Pemerintah:</span> {selectedItem['Sub Government Agency Name']}
                  </p>
                </div>
              </div>
             
              <div className="flex items-center justify-between p-6 bg-gray-50 rounded-xl mb-6">
                <div className="flex items-center">
                  <Users className="h-6 w-6 mr-2 text-blue-500" />
                  <div>
                    <p className="text-sm text-gray-600">Kuota Tersedia</p>
                    <p className="text-2xl font-bold text-gray-800">{selectedItem['Jumlah Kuota']}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-600">Sudah Terdaftar</p>
                  <p className="text-2xl font-bold text-gray-800">{selectedItem['Jumlah Terdaftar']}</p>
                </div>
              </div>

              {userProfile && (
                <div className="mb-6 p-4 bg-green-50 rounded-xl">
                  <p className="font-semibold text-gray-800">Peluang Match dengan Profil Anda</p>
                  <p className="text-3xl font-bold text-green-600">{selectedItem.matchPercentage}%</p>
                </div>
              )}
             
              <button
                onClick={() => window.open('https://maganghub.kemnaker.go.id/lowongan', '_blank')}
                className="w-full bg-black text-white py-4 rounded-xl font-bold text-lg hover:shadow-lg transition transform hover:scale-105"
              >
                Daftar Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Login Modal */}
      {loginModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <h2 className="text-2xl font-bold mb-4">Login ke SIAPkerja/Maganghub</h2>
            {loginError && <p className="text-red-600 mb-4">{loginError}</p>}
            <input
              type="text"
              placeholder="Email atau nomor HP"
              value={loginUsername}
              onChange={(e) => setLoginUsername(e.target.value)}
              className="w-full p-3 border rounded mb-4"
            />
            <input
              type="password"
              placeholder="Password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              className="w-full p-3 border rounded mb-4"
            />
            <button onClick={handleLogin} className="w-full bg-black text-white py-3 rounded">
              Login
            </button>
            <button onClick={() => setLoginModalOpen(false)} className="mt-2 text-gray-600 w-full">
              Batal
            </button>
          </div>
        </div>
      )}
      {/* Footer */}
      <footer className="bg-black text-white py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center text-center mb-8">
            <div className="mb-4 flex items-center justify-center gap-4">
              <img
                src="/images/Logo Filter Maganghub Wht.png"
                alt="Filter Maganghub Logo"
                className="h-16"
              />
              <p className="text-gray-400 text-xl font-bold">Filter Maganghub</p>
            </div>
            <p className="text-gray-400">
              Platform ini dibuat untuk para calon peserta magang agar lebih mudah mencari lowongan magang di Maganghub Kemnaker, dengan fitur filter jurusan yang sesuai dengan calon peserta magang.
            </p>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-gray-400">
            <p className="mt-2">Made by Mateus</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
export default App;