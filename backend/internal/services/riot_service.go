package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type RiotService struct {
	client       *http.Client
	apiKey       string
	ddragonVer   string
	champMap     map[int]ChampionData // key: championKey (e.g. 82) -> Name: Mordekaiser, ID: Mordekaiser
	mu           sync.RWMutex
	lastDDragon  time.Time
}

type ChampionData struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Key  string `json:"key"`
}

type RiotAccount struct {
	PUUID    string `json:"puuid"`
	GameName string `json:"gameName"`
	TagLine  string `json:"tagLine"`
}

type RiotSummoner struct {
	ID            string `json:"id"`
	AccountID     string `json:"accountId"`
	PUUID         string `json:"puuid"`
	ProfileIconID int    `json:"profileIconId"`
	SummonerLevel int    `json:"summonerLevel"`
}

type RiotLeagueEntry struct {
	QueueType    string `json:"queueType"` // RANKED_SOLO_5x5, RANKED_FLEX_SR
	Tier         string `json:"tier"`
	Rank         string `json:"rank"`
	LeaguePoints int    `json:"leaguePoints"`
	Wins         int    `json:"wins"`
	Losses       int    `json:"losses"`
}

type RiotMastery struct {
	ChampionID     int   `json:"championId"`
	ChampionLevel  int   `json:"championLevel"`
	ChampionPoints int   `json:"championPoints"`
	LastPlayTime   int64 `json:"lastPlayTime"`
}

type RiotFullProfile struct {
	GameName      string
	TagLine       string
	Region        string
	PUUID         string
	ProfileIconURL string
	SummonerLevel int
	SoloTier      string
	SoloRank      string
	SoloLP        int
	FlexTier      string
	FlexRank      string
	FlexLP        int
	TopChampions  []ChampionMasteryDisplay
	OpggURL       string
	PatchVersion  string
}

type ChampionMasteryDisplay struct {
	ChampionName  string
	ChampionID    string
	Level         int
	Points        int
	FormattedPts  string
	SplashURL     string
}

func NewRiotService() *RiotService {
	apiKey := os.Getenv("RIOT_API_KEY")
	s := &RiotService{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		apiKey:   apiKey,
		champMap: make(map[int]ChampionData),
	}
	go s.refreshDataDragon()
	return s
}

func (s *RiotService) SetAPIKey(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.apiKey = key
}

func (s *RiotService) GetAPIKey() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.apiKey != "" {
		return s.apiKey
	}
	return os.Getenv("RIOT_API_KEY")
}

func ResolveRiotRouting(region string) string {
	r := strings.ToLower(strings.TrimSpace(region))
	switch r {
	case "br", "br1", "na", "na1", "la1", "la2", "lan", "las":
		return "americas"
	case "euw", "euw1", "eun", "eun1", "eune", "tr", "tr1", "ru":
		return "europe"
	case "kr", "jp", "jp1":
		return "asia"
	case "oc", "oc1", "oce", "ph2", "sg2", "th2", "tw2", "vn2", "sea":
		return "sea"
	default:
		return "americas"
	}
}

func NormalizeRegion(region string) string {
	r := strings.ToLower(strings.TrimSpace(region))
	switch r {
	case "br":
		return "br1"
	case "na":
		return "na1"
	case "euw":
		return "euw1"
	case "eun", "eune":
		return "eun1"
	case "lan":
		return "la1"
	case "las":
		return "la2"
	case "oce", "oc":
		return "oc1"
	case "jp":
		return "jp1"
	case "tr":
		return "tr1"
	default:
		if r == "" {
			return "br1"
		}
		return r
	}
}

func (s *RiotService) refreshDataDragon() {
	resp, err := s.client.Get("https://ddragon.leagueoflegends.com/api/versions.json")
	if err != nil {
		return
	}
	defer resp.Body.Close()

	var versions []string
	if err := json.NewDecoder(resp.Body).Decode(&versions); err != nil || len(versions) == 0 {
		return
	}
	latestVer := versions[0]

	champResp, err := s.client.Get(fmt.Sprintf("https://ddragon.leagueoflegends.com/cdn/%s/data/pt_BR/champion.json", latestVer))
	if err != nil {
		return
	}
	defer champResp.Body.Close()

	var champDoc struct {
		Data map[string]struct {
			ID   string `json:"id"`
			Key  string `json:"key"`
			Name string `json:"name"`
		} `json:"data"`
	}
	if err := json.NewDecoder(champResp.Body).Decode(&champDoc); err != nil {
		return
	}

	newMap := make(map[int]ChampionData)
	for _, c := range champDoc.Data {
		k, err := strconv.Atoi(c.Key)
		if err == nil {
			newMap[k] = ChampionData{
				ID:   c.ID,
				Name: c.Name,
				Key:  c.Key,
			}
		}
	}

	s.mu.Lock()
	s.ddragonVer = latestVer
	s.champMap = newMap
	s.lastDDragon = time.Now()
	s.mu.Unlock()
}

func (s *RiotService) ensureDDragon() string {
	s.mu.RLock()
	ver := s.ddragonVer
	last := s.lastDDragon
	s.mu.RUnlock()

	if ver == "" || time.Since(last) > 12*time.Hour {
		s.refreshDataDragon()
		s.mu.RLock()
		ver = s.ddragonVer
		s.mu.RUnlock()
	}
	if ver == "" {
		return "14.19.1"
	}
	return ver
}

func (s *RiotService) GetAccount(gameName, tagLine, region string) (*RiotAccount, error) {
	key := s.GetAPIKey()
	if key == "" {
		return nil, fmt.Errorf("RIOT_API_KEY não configurada no servidor (.env)")
	}

	routing := ResolveRiotRouting(region)
	urlStr := fmt.Sprintf("https://%s.api.riotgames.com/riot/account/v1/accounts/by-riot-id/%s/%s",
		routing,
		url.PathEscape(gameName),
		url.PathEscape(tagLine),
	)

	req, err := http.NewRequest(http.MethodGet, urlStr, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Riot-Token", key)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("erro de conexão com a Riot API: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("invocador '%s#%s' não encontrado", gameName, tagLine)
	}
	if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("chave da Riot API inválida ou expirada (HTTP %d)", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("erro da Riot API (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var acc RiotAccount
	if err := json.NewDecoder(resp.Body).Decode(&acc); err != nil {
		return nil, err
	}
	return &acc, nil
}

func (s *RiotService) GetSummonerByPUUID(puuid, region string) (*RiotSummoner, error) {
	key := s.GetAPIKey()
	if key == "" {
		return nil, fmt.Errorf("RIOT_API_KEY não configurada")
	}

	reg := NormalizeRegion(region)
	urlStr := fmt.Sprintf("https://%s.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/%s", reg, puuid)

	req, err := http.NewRequest(http.MethodGet, urlStr, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Riot-Token", key)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("erro ao buscar summoner (HTTP %d)", resp.StatusCode)
	}

	var sum RiotSummoner
	if err := json.NewDecoder(resp.Body).Decode(&sum); err != nil {
		return nil, err
	}
	return &sum, nil
}

func (s *RiotService) GetLeagueEntries(summonerID, puuid, region string) ([]RiotLeagueEntry, error) {
	key := s.GetAPIKey()
	if key == "" {
		return nil, fmt.Errorf("RIOT_API_KEY não configurada")
	}

	reg := NormalizeRegion(region)
	// Try by-puuid endpoint or by-summoner endpoint
	urlStr := fmt.Sprintf("https://%s.api.riotgames.com/lol/league/v4/entries/by-summoner/%s", reg, summonerID)
	if summonerID == "" && puuid != "" {
		urlStr = fmt.Sprintf("https://%s.api.riotgames.com/lol/league/v4/entries/by-puuid/%s", reg, puuid)
	}

	req, err := http.NewRequest(http.MethodGet, urlStr, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Riot-Token", key)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return []RiotLeagueEntry{}, nil
	}

	var entries []RiotLeagueEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return []RiotLeagueEntry{}, nil
	}
	return entries, nil
}

func (s *RiotService) GetTopMasteries(puuid, region string, count int) ([]RiotMastery, error) {
	key := s.GetAPIKey()
	if key == "" {
		return nil, fmt.Errorf("RIOT_API_KEY não configurada")
	}

	if count <= 0 {
		count = 3
	}
	reg := NormalizeRegion(region)
	urlStr := fmt.Sprintf("https://%s.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/%s/top?count=%d", reg, puuid, count)

	req, err := http.NewRequest(http.MethodGet, urlStr, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Riot-Token", key)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return []RiotMastery{}, nil
	}

	var masteries []RiotMastery
	if err := json.NewDecoder(resp.Body).Decode(&masteries); err != nil {
		return []RiotMastery{}, nil
	}
	return masteries, nil
}

func formatNumber(n int) string {
	str := strconv.Itoa(n)
	var res []string
	for len(str) > 3 {
		res = append([]string{str[len(str)-3:]}, res...)
		str = str[:len(str)-3]
	}
	if len(str) > 0 {
		res = append([]string{str}, res...)
	}
	return strings.Join(res, ".")
}

func (s *RiotService) FetchFullProfile(gameName, tagLine, region string) (*RiotFullProfile, error) {
	acc, err := s.GetAccount(gameName, tagLine, region)
	if err != nil {
		return nil, err
	}

	summoner, err := s.GetSummonerByPUUID(acc.PUUID, region)
	if err != nil {
		return nil, fmt.Errorf("conta encontrada, mas perfil de invocador indisponível na região %s: %w", region, err)
	}

	entries, _ := s.GetLeagueEntries(summoner.ID, acc.PUUID, region)
	masteries, _ := s.GetTopMasteries(acc.PUUID, region, 3)

	ver := s.ensureDDragon()

	s.mu.RLock()
	champMap := s.champMap
	s.mu.RUnlock()

	var soloTier, soloRank string
	var soloLP int
	var flexTier, flexRank string
	var flexLP int

	for _, e := range entries {
		if e.QueueType == "RANKED_SOLO_5x5" {
			soloTier = strings.Title(strings.ToLower(e.Tier))
			soloRank = e.Rank
			soloLP = e.LeaguePoints
		} else if e.QueueType == "RANKED_FLEX_SR" {
			flexTier = strings.Title(strings.ToLower(e.Tier))
			flexRank = e.Rank
			flexLP = e.LeaguePoints
		}
	}

	var topChamps []ChampionMasteryDisplay
	for _, m := range masteries {
		cData, ok := champMap[m.ChampionID]
		cName := fmt.Sprintf("Campeão #%d", m.ChampionID)
		cID := "Mordekaiser"
		if ok {
			cName = cData.Name
			cID = cData.ID
		}

		topChamps = append(topChamps, ChampionMasteryDisplay{
			ChampionName: cName,
			ChampionID:   cID,
			Level:        m.ChampionLevel,
			Points:       m.ChampionPoints,
			FormattedPts: formatNumber(m.ChampionPoints),
			SplashURL:    fmt.Sprintf("https://ddragon.leagueoflegends.com/cdn/img/champion/loading/%s_0.jpg", cID),
		})
	}

	regNorm := strings.ToLower(NormalizeRegion(region))
	opggReg := "br"
	switch regNorm {
	case "br1":
		opggReg = "br"
	case "na1":
		opggReg = "na"
	case "euw1":
		opggReg = "euw"
	case "eun1":
		opggReg = "eune"
	case "la1":
		opggReg = "lan"
	case "la2":
		opggReg = "las"
	case "kr":
		opggReg = "kr"
	case "jp1":
		opggReg = "jp"
	case "oc1":
		opggReg = "oce"
	}

	opggURL := fmt.Sprintf("https://www.op.gg/summoners/%s/%s-%s",
		opggReg,
		url.PathEscape(acc.GameName),
		url.PathEscape(acc.TagLine),
	)

	iconURL := fmt.Sprintf("https://ddragon.leagueoflegends.com/cdn/%s/img/profileicon/%d.png", ver, summoner.ProfileIconID)

	return &RiotFullProfile{
		GameName:       acc.GameName,
		TagLine:        acc.TagLine,
		Region:         strings.ToUpper(strings.TrimSuffix(regNorm, "1")),
		PUUID:          acc.PUUID,
		ProfileIconURL: iconURL,
		SummonerLevel:  summoner.SummonerLevel,
		SoloTier:       soloTier,
		SoloRank:       soloRank,
		SoloLP:         soloLP,
		FlexTier:       flexTier,
		FlexRank:       flexRank,
		FlexLP:         flexLP,
		TopChampions:   topChamps,
		OpggURL:        opggURL,
		PatchVersion:   ver,
	}, nil
}
