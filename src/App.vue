<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { BarChart3, Clapperboard, Swords, Trophy, Users } from 'lucide-vue-next'
import logo from './assets/team/team-logo.png'
import { supabase } from './lib/supabase'
import { saveMatchRecords } from './lib/matchRecords'
import { captureVideoMetadata } from './lib/videoMetadata'

const page=ref('概览'), profile=ref(null), notice=ref(''), loading=ref(true), players=ref([]), records=ref([]), videoMetadata=ref([]), seasonStats=ref([]), campStats=ref([]), scoreTrend=ref([]), radarStats=ref([]), teamBoardStats=ref([]), bestProfiles=ref([]), seasons=ref([]), season=ref(null), overviewSeasonId=ref('all'), rankingSeasonId=ref('all'), playerSearch=ref(''), recordingCode=ref(''), recordingAuthorized=ref(false), recognizingSheet=ref(false), hoverSeat=ref(null), entryPage=ref(0)
const form=ref({seasonId:null,matchDate:'',videoUrl:''})
const rows=ref([emptyRow()])
let playerProfilesChannel=null
const nav=[['概览',BarChart3],['排行榜',Trophy],['队员档案',Users],['录像库',Clapperboard],['对局录入',Swords]]
const num=value=>Number(value||0)
const seasonName=computed(()=>season.value?.name||'未设置赛季')
const recordsFor=seasonId=>seasonId==='all'?records.value:records.value.filter(row=>row.season_id===seasonId)
const overviewRecords=computed(()=>recordsFor(overviewSeasonId.value))
const rankingRecords=computed(()=>recordsFor(rankingSeasonId.value))
const overviewStat=computed(()=>{if(!seasonStats.value.length)return null;if(overviewSeasonId.value!=='all')return seasonStats.value.find(stat=>stat.season_id===overviewSeasonId.value)||null;return seasonStats.value.reduce((all,stat)=>({total_score:num(all.total_score)+num(stat.total_score),player_record_count:num(all.player_record_count)+num(stat.player_record_count),win_count:num(all.win_count)+num(stat.win_count),loss_count:num(all.loss_count)+num(stat.loss_count),mvp_count:num(all.mvp_count)+num(stat.mvp_count),video_count:num(all.video_count)+num(stat.video_count),player_count:Math.max(num(all.player_count),num(stat.player_count)),highest_single_score:Math.max(num(all.highest_single_score),num(stat.highest_single_score))}),{total_score:0,player_record_count:0,win_count:0,loss_count:0,mvp_count:0,video_count:0,player_count:0,highest_single_score:0})})
const totalScore=computed(()=>overviewStat.value?num(overviewStat.value.total_score):overviewRecords.value.reduce((sum,row)=>sum+num(row.score),0))
const wins=computed(()=>overviewStat.value?num(overviewStat.value.win_count):overviewRecords.value.filter(row=>row.result==='胜利').length)
const winRate=computed(()=>overviewStat.value?(num(overviewStat.value.player_record_count)?num(overviewStat.value.win_count)/num(overviewStat.value.player_record_count)*100:0):(overviewRecords.value.length?Math.round(wins.value/overviewRecords.value.length*1000)/10:0))
const overviewMvp=computed(()=>overviewStat.value?num(overviewStat.value.mvp_count):overviewMembers.value.reduce((sum,player)=>sum+player.mvp,0))
const overviewPlayerCount=computed(()=>overviewStat.value?num(overviewStat.value.player_count):overviewMembers.value.filter(player=>player.matches).length)
const overviewVideoCount=computed(()=>overviewStat.value?num(overviewStat.value.video_count):(overviewSeasonId.value==='all'?videos.value.length:videos.value.filter(video=>video.seasonId===overviewSeasonId.value).length))
const overviewHighestScore=computed(()=>overviewStat.value?num(overviewStat.value.highest_single_score):(overviewRecords.value.length?Math.max(...overviewRecords.value.map(row=>num(row.score))):0))
const overviewDays=computed(()=>new Set(overviewRecords.value.map(row=>row.match_date).filter(Boolean)).size)
const overviewDailyScore=computed(()=>overviewDays.value?totalScore.value/overviewDays.value:0)
const preferredBoards=computed(()=>{
  const groups={}
  overviewRecords.value.filter(row=>row.board_type).forEach(row=>{const key=row.board_type;if(!groups[key])groups[key]={board_type:key,total_matches:0,win_matches:0};groups[key].total_matches+=1;if(row.result==='胜利')groups[key].win_matches+=1})
  return Object.values(groups).map(item=>({...item,win_rate:item.total_matches?Math.round(item.win_matches/item.total_matches*10000)/100:0})).sort((a,b)=>b.win_rate-a.win_rate||b.total_matches-a.total_matches).slice(0,3)
})
const recentMvpPlayers=computed(()=>{const seen=new Set();return overviewRecords.value.filter(row=>num(row.mvp_score)>0).filter(row=>{if(seen.has(row.player_id))return false;seen.add(row.player_id);return true}).slice(0,3).map(row=>players.value.find(player=>player.id===row.player_id)||{id:row.player_id,name:row.player_name||'未知队员',portrait_path:null})})
const svpRate=computed(()=>overviewRecords.value.length?overviewRecords.value.filter(row=>num(row.svp_score)>0).length/overviewRecords.value.length*100:0)
const voteWolfAverage=computed(()=>overviewRecords.value.length?overviewRecords.value.reduce((sum,row)=>sum+num(row.vote_wolf_count),0)/overviewRecords.value.length:0)
const scapegoatTotal=computed(()=>overviewRecords.value.reduce((sum,row)=>sum+Math.min(0,num(row.scapegoat_score)),0))
const seatStats=computed(()=>Array.from({length:12},(_,index)=>{const seat=index+1,rows=overviewRecords.value.filter(row=>num(row.seat_number)===seat),wins=rows.filter(row=>row.result==='胜利').length;return {seat,games:rows.length,winRate:rows.length?wins/rows.length*100:0}}))
const seatBest=computed(()=>[...seatStats.value].filter(item=>item.games).sort((a,b)=>b.winRate-a.winRate)[0]||null)
const seatWorst=computed(()=>[...seatStats.value].filter(item=>item.games).sort((a,b)=>a.winRate-b.winRate)[0]||null)
const seatHover=computed(()=>seatStats.value.find(item=>item.seat===hoverSeat.value)||null)
const boardRed=computed(()=>teamBoardStats.value.filter(item=>num(item.total_matches)>=3).slice().sort((a,b)=>num(b.win_rate)-num(a.win_rate)).slice(0,3))
const boardBlack=computed(()=>teamBoardStats.value.filter(item=>num(item.total_matches)>=3).slice().sort((a,b)=>num(a.win_rate)-num(b.win_rate)).slice(0,3))
const selectedCampStats=computed(()=>{const rows=overviewSeasonId.value==='all'?campStats.value:campStats.value.filter(row=>row.season_id===overviewSeasonId.value);const rate=camp=>{const subset=rows.filter(row=>row.camp===camp);const total=subset.reduce((sum,row)=>sum+num(row.player_record_count),0),wins=subset.reduce((sum,row)=>sum+num(row.win_count),0);if(total)return wins/total*100;const fallback=overviewRecords.value.filter(row=>camp==='狼人'?(row.camp==='狼人'||row.camp==='狼队'):row.camp===camp);return fallback.length?fallback.filter(row=>row.result==='胜利').length/fallback.length*100:0};return {good:rate('好人'),wolf:rate('狼人')}})
const selectedTrend=computed(()=>{const rows=overviewSeasonId.value==='all'?scoreTrend.value:scoreTrend.value.filter(row=>row.season_id===overviewSeasonId.value);if(rows.length)return rows;const grouped={};overviewRecords.value.forEach(row=>{if(row.match_date)grouped[row.match_date]=(grouped[row.match_date]||0)+num(row.score)});let total=0;return Object.entries(grouped).sort(([a],[b])=>a.localeCompare(b)).map(([match_date,daily_score])=>({match_date,daily_score,cumulative_score:total+=daily_score}))})
const trendPoints=computed(()=>{const list=selectedTrend.value;if(!list.length)return '';const values=list.map(row=>num(row.cumulative_score)),min=Math.min(...values,0),max=Math.max(...values,0),range=max-min||1;return values.map((value,index=0)=>{const x=list.length===1?300:index/(list.length-1)*600;const y=180-(value-min)/range*150;return x+','+y}).join(' ')})
const bvidFromUrl=url=>String(url||'').match(/BV[0-9A-Za-z]+/i)?.[0]?.toUpperCase()||null
const seasonLabel=id=>seasons.value.find(item=>item.id===id)?.name||'未分类赛季'
const videos=computed(()=>[...new Set(records.value.map(row=>row.video_url).filter(Boolean))].map(url=>{const record=records.value.find(row=>row.video_url===url);return {url,seasonId:record?.season_id||null,matchDate:record?.match_date||null,metadata:videoMetadata.value.find(item=>item.bvid===bvidFromUrl(url))||null}}))
const videoGroups=computed(()=>seasons.value.map(item=>({id:item.id,name:item.name,videos:videos.value.filter(video=>video.seasonId===item.id)})).filter(group=>group.videos.length).concat(videos.value.some(video=>!video.seasonId)?[{id:'none',name:'未分类赛季',videos:videos.value.filter(video=>!video.seasonId)}]:[]))
function makeMembers(sourceRecords){
  return players.value.map(player=>{
  const own=sourceRecords.filter(row=>row.player_id===player.id), camp=list=>list.filter(row=>row.result==='胜利').length
  const rate=list=>list.length?Math.round(camp(list)/list.length*100):0
  const wolf=own.filter(row=>row.camp==='狼队'||row.camp==='狼人'), good=own.filter(row=>row.camp==='好人')
  const points=own.reduce((sum,row)=>sum+num(row.score),0)
  const roles=Object.entries(own.reduce((all,row)=>{if(row.role)all[row.role]=(all[row.role]||0)+1;return all},{})).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([role])=>role)
  return {...player,title:(player.titles||[]).join(' · ')||player.team_role||'—',roles,points,matches:own.length,wolfMatches:wolf.length,goodMatches:good.length,wolf:rate(wolf),good:rate(good),mvp:own.filter(row=>num(row.mvp_score)>0).length,svp:own.filter(row=>num(row.svp_score)>0).length,winRate:rate(own)}
  })
}
const members=computed(()=>makeMembers(records.value))
const overviewMembers=computed(()=>makeMembers(overviewRecords.value))
const scoreRanked=computed(()=>[...makeMembers(rankingRecords.value)].sort((a,b)=>b.points-a.points||b.mvp-a.mvp))
const winRateRanked=computed(()=>[...makeMembers(rankingRecords.value)].filter(player=>player.matches>0).sort((a,b)=>b.winRate-a.winRate||b.matches-a.matches))
const mvpRanked=computed(()=>[...makeMembers(rankingRecords.value)].sort((a,b)=>b.mvp-a.mvp||b.points-a.points))
const filteredMembers=computed(()=>members.value.filter(player=>((player.name||'')+(player.id||'')).toLowerCase().includes(playerSearch.value.trim().toLowerCase())))
function emptyRow(){return {player:'',role:'',result:'',score:0,seat_number:'',vote_wolf_count:0,vote_score:0,behavior_score:0,title:'无',remarks:''}}
const currentEntryRow=computed(()=>rows.value[entryPage.value]||rows.value[0])
function addRow(){rows.value.push(emptyRow());entryPage.value=rows.value.length-1}
function removeRow(index){if(rows.value.length>1){rows.value.splice(index,1);entryPage.value=Math.min(entryPage.value,rows.value.length-1)}}
const profileRecords=computed(()=>profile.value?records.value.filter(row=>row.player_id===profile.value.id):[])
const profileRadar=computed(()=>{
  const rows=radarStats.value.filter(stat=>stat.player_id===profile.value?.id)
  const total=rows.reduce((sum,row)=>sum+num(row.total_games),0)
  const weighted=key=>total?Math.round(rows.reduce((sum,row)=>sum+num(row[key])*num(row.total_games),0)/total*10)/10:0
  return {leadership:weighted('score_carry'),operation:weighted('score_operation'),resilience:weighted('score_resilience'),scoring:weighted('score_scoring'),vote_wolf:weighted('score_voting')}
})
const teamRadar=computed(()=>{
  const rows=overviewRecords.value.filter(row=>row.result)
  const total=rows.length||1, wins=rows.filter(row=>row.result==='胜利').length, losses=rows.filter(row=>row.result==='失败').length
  const mvp=rows.filter(row=>num(row.mvp_score)>0).length, nonCivil=rows.filter(row=>row.role&&row.role!=='平民'), positive=nonCivil.filter(row=>num(row.behavior_score)>0).length
  const svp=rows.filter(row=>num(row.svp_score)>0).length, scapegoat=rows.filter(row=>num(row.scapegoat_score)<0).length
  const average=rows.reduce((sum,row)=>sum+num(row.score),0)/total
  const voteRows=rows.filter(row=>row.camp==='好人'&&row.role!=='预言家'&&row.vote_wolf_count!==null&&row.vote_wolf_count!==undefined)
  const voteAverage=voteRows.length?voteRows.reduce((sum,row)=>sum+num(row.vote_wolf_count),0)/voteRows.length:0
  const cap=value=>Math.max(0,Math.min(10,Math.round(value*10)/10))
  return {leadership:cap((.6*mvp/Math.max(1,wins)+.4*mvp/total)*20),operation:nonCivil.length?cap(positive/nonCivil.length*18):5,resilience:cap(5+(svp-scapegoat)/Math.max(1,losses)*5),scoring:cap(5+(average-3.3)*2.5),vote_wolf:voteRows.length?cap(voteAverage/1.5*10):5}
})
const profileBest=computed(()=>bestProfiles.value.find(item=>item.player_id===profile.value?.id)||{best_board:'暂无数据',best_board_win_rate:0,best_board_games:0,best_role:'暂无数据',best_role_win_rate:0,best_role_games:0})
const profileDays=computed(()=>new Set(profileRecords.value.map(row=>row.match_date).filter(Boolean)).size)
const profileDailyScore=computed(()=>profileDays.value?profile.value.points/profileDays.value:0)
function openProfile(player){profile.value=members.value.find(item=>item.id===player.id)||{...player,roles:[],points:0,matches:0,wolfMatches:0,goodMatches:0,wolf:0,good:0,mvp:0,svp:0}}
function closeProfile(){profile.value=null}
function radarPoints(stat){const values=[stat.leadership,stat.operation,stat.resilience,stat.scoring,stat.vote_wolf];return values.map((value,index)=>{const angle=(-90+index*72)*Math.PI/180,r=62*num(value)/10;return `${100+r*Math.cos(angle)},${100+r*Math.sin(angle)}`}).join(' ')}
function radarGrid(value){return Array.from({length:5},(_,index)=>{const angle=(-90+index*72)*Math.PI/180,r=62*value/100;return `${100+r*Math.cos(angle)},${100+r*Math.sin(angle)}`}).join(' ')}
function campDonutStyle(player){const total=player.goodMatches+player.wolfMatches;if(!total)return {background:'conic-gradient(#e2e8f0 0 100%)'};const good=Math.round(player.goodMatches/total*1000)/10;return {background:`conic-gradient(#8b5cf6 0 ${good}%, #f59e0b ${good}% 100%)`}}
function defaultVideoTitle(video){const compact=String(video.matchDate||'').replaceAll('-','').slice(-6);return seasonLabel(video.seasonId)+(compact?' '+compact:'')}
const titleTone=index=>'title-chip tone-'+index%4
async function refreshVideoMetadata(){const pending=videos.value.filter(video=>!video.metadata);if(!pending.length){notice.value='录像信息已是最新。';return}try{for(const video of pending)await captureVideoMetadata(video.url);await loadData();notice.value='已更新 '+pending.length+' 条录像信息。'}catch(error){notice.value='部分录像信息未能获取：'+error.message}}
async function loadData(){
  loading.value=true
  if(!supabase){notice.value='数据库尚未配置。';loading.value=false;return}
  try{
    const [playerResult,activeSeasonResult,seasonsResult,recordResult,videoResult,statsResult,campResult,trendResult,radarResult,boardResult,bestProfileResult]=await Promise.all([
      supabase.from('players').select('id,name,team_role,portrait_path,titles,created_at').order('created_at'),
      supabase.from('seasons').select('id,name,start_date,end_date,is_active').eq('is_active',true).maybeSingle(),
      supabase.from('seasons').select('id,name,start_date,end_date,is_active').order('start_date',{ascending:false}),
      supabase.from('match_records').select('*').order('match_date',{ascending:false}),
      supabase.from('video_metadata').select('*').order('updated_at',{ascending:false}),
      supabase.from('season_stats').select('*'),
      supabase.from('season_camp_stats').select('*'),
      supabase.from('season_score_trend').select('*').order('match_date'),
      supabase.from('v_player_radar_chart').select('*'),
      supabase.from('v_team_board_stats').select('*'),
      supabase.from('v_player_best_profiles').select('*')
    ])
    if(playerResult.error)throw playerResult.error
    if(activeSeasonResult.error)throw activeSeasonResult.error
    if(seasonsResult.error)throw seasonsResult.error
    if(recordResult.error)throw recordResult.error
    players.value=playerResult.data||[]; seasons.value=seasonsResult.data||[]; season.value=activeSeasonResult.data||null
    form.value.seasonId=season.value?.id||null
    records.value=recordResult.data||[]
    videoMetadata.value=videoResult.error ? [] : videoResult.data||[]
    seasonStats.value=statsResult.error ? [] : statsResult.data||[]
    campStats.value=campResult.error ? [] : campResult.data||[]
    scoreTrend.value=trendResult.error ? [] : trendResult.data||[]
    radarStats.value=radarResult.error ? [] : radarResult.data||[]
    teamBoardStats.value=boardResult.error ? [] : boardResult.data||[]
    bestProfiles.value=bestProfileResult.error ? [] : bestProfileResult.data||[]
  }catch(error){notice.value='读取数据库失败：'+error.message}
  finally{loading.value=false}
}
async function submit(){
  if(!recordingAuthorized.value){notice.value='请先输入正确的录入码。';return}
  if(!form.value.seasonId){notice.value='没有可用赛季，暂时无法写入对局。';return}
  if(rows.value.some(row=>!row.player||!row.role||!row.result)){notice.value='请完整填写每一行的队员、身份和结果。';return}
  try{
    const videoUrl=form.value.videoUrl
    await saveMatchRecords({rows:rows.value,seasonId:form.value.seasonId,matchDate:form.value.matchDate||new Date().toISOString().slice(0,10),videoUrl,code:recordingCode.value})
    let metadataWarning=''
    if(videoUrl){try{await captureVideoMetadata(videoUrl)}catch(error){metadataWarning='录像已保存，但暂时无法获取 B 站封面和标题。'}}
    notice.value='对局已写入数据库。'+metadataWarning; rows.value=[emptyRow()]; entryPage.value=0; form.value.videoUrl=''; await loadData(); page.value='概览'
  }catch(error){notice.value=error.message}
}
async function authorizeRecording(){
  if(!recordingCode.value.trim()){notice.value='请输入录入码。';return}
  const {data,error}=await supabase.functions.invoke('match-import',{body:{action:'authorize',code:recordingCode.value}})
  if(error||data?.error){notice.value=data?.error||error?.message||'录入码验证失败。';return}
  recordingAuthorized.value=true;notice.value='录入权限已开启。'
}
async function recognizeSheet(event){
  const file=event.target.files?.[0]
  if(!file)return
  if(!recordingAuthorized.value){notice.value='请先通过录入码验证。';event.target.value='';return}
  if(file.size>15*1024*1024){notice.value='图片请控制在 15MB 以内。';event.target.value='';return}
  recognizingSheet.value=true
  try{
    const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})
    const imageBase64=String(dataUrl).split(',')[1]
    const {data,error}=await supabase.functions.invoke('match-import',{body:{action:'recognize',code:recordingCode.value,imageBase64,mimeType:file.type,playerNames:players.value.map(player=>player.name)}})
    if(error||data?.error)throw new Error(data?.error||error?.message||'图片识别失败。')
    rows.value=(data.rows||[]).map(row=>({...emptyRow(),...row}))
    if(!rows.value.length)rows.value=[emptyRow()]
    notice.value=`已识别 ${rows.value.length} 条队员记录，请核对并补充投狼数等数据。`
  }catch(error){notice.value=error.message||'图片识别失败。'}finally{recognizingSheet.value=false;event.target.value=''}
}
onMounted(async()=>{await loadData();if(supabase){playerProfilesChannel=supabase.channel('players-live').on('postgres_changes',{event:'*',schema:'public',table:'players'},loadData).subscribe()}})
onUnmounted(()=>{if(playerProfilesChannel&&supabase)supabase.removeChannel(playerProfilesChannel)})
</script>

<template>
  <main class="min-h-screen text-slate-800">
    <div class="relative mx-auto flex min-h-screen max-w-[1500px]">
      <aside class="hidden w-72 shrink-0 border-r border-white/70 bg-white/35 px-7 py-9 backdrop-blur-xl lg:flex lg:flex-col">
        <div class="flex items-center gap-3"><img :src="logo" class="h-16 w-16 rounded-full border-2 border-yellow-200 object-cover shadow-lg"/><div><b class="text-xl text-violet-950">超能高校</b><p class="mt-1 text-xs tracking-[.2em] text-violet-500">PSIONIC HIGH</p></div></div>
        <nav class="mt-20 space-y-3"><button v-for="[name,icon] in nav" :key="name" class="nav-button" :class="page===name?'nav-active':''" @click="profile=null;page=name"><component :is="icon" :size="21"/>{{ name }}</button></nav>
        <div class="mt-auto rounded-2xl border border-yellow-200/70 bg-yellow-100/40 p-4 text-sm"><p class="font-bold text-yellow-700">{{ seasonName }}</p><p class="mt-1 text-xs text-slate-500">数据来自战队数据库</p></div>
      </aside>
      <nav class="mobile-nav lg:hidden" aria-label="主导航">
        <button v-for="[name,icon] in nav" :key="name" :class="{active:page===name&&!profile}" @click="profile=null;page=name"><component :is="icon" :size="20"/><span>{{ name }}</span></button>
      </nav>
      <section class="min-w-0 flex-1 px-5 py-7 md:px-10">
        <header class="flex items-center justify-between"><div><p class="text-sm font-medium text-violet-500">{{ seasonName }} · 战队数据中心</p><h1 class="chrome-title mt-1 text-3xl font-black md:text-4xl">{{ profile ? profile.name : page }}</h1></div><button class="metal-button" @click="profile=null;page='对局录入'">+ 录入对局</button></header>
        <p v-if="notice" class="mt-4 rounded-xl bg-yellow-100 px-4 py-3 text-sm text-yellow-800">{{ notice }}</p>
        <p v-if="loading" class="mt-8 text-violet-500">正在读取数据库…</p>

        <template v-else-if="profile">
          <button class="mt-7 text-sm font-bold text-violet-700" @click="closeProfile">← 返回队员档案</button>
          <section class="metal-card mt-5 overflow-hidden">
            <div class="grid min-h-[600px] lg:grid-cols-[1.15fr_.85fr]">
              <div class="p-7 md:p-10">
                <div class="title-list"><span v-for="(title,index) in profile.titles||[]" :key="title" :class="titleTone(index)">{{ title }}</span></div>
                <h2 class="chrome-title mt-5 text-5xl font-black">{{ profile.name }}</h2>
                <p class="mt-2 text-violet-600">常用身份：{{ profile.roles.length ? profile.roles.join(' · ') : '—' }}</p>
                <div class="best-profile-tags mt-3"><span class="best-tag best-board">擅长版型 · {{ profileBest.best_board }} · {{ profileBest.best_board_win_rate }}% · {{ profileBest.best_board_games }} 局</span><span class="best-tag best-role">擅长身份 · {{ profileBest.best_role }} · {{ profileBest.best_role_win_rate }}%</span></div>
                <div class="profile-dashboard mt-6">
                  <div class="dashboard-score"><div><p>总积分</p><b>{{ profile.points }}</b><div class="score-meta"><div><p>日均积分</p><strong>{{ profileDailyScore.toFixed(1) }} 分</strong></div><div><p>比赛日</p><strong>{{ profileDays }} 天</strong></div></div></div><div class="dashboard-games"><div><p>总场数</p><div class="mini-camp-donut" :style="campDonutStyle(profile)"><div><b>{{ profile.matches }}</b><span>场</span></div></div></div><div class="mini-camp-legend"><span><i class="good-dot"></i>好人 {{ profile.goodMatches }}</span><span><i class="wolf-dot"></i>狼人 {{ profile.wolfMatches }}</span></div></div></div>
                  <div class="dashboard-performance"><div><p>阵营胜率</p><div class="mini-win-bars"><span>好人 <i class="good" :style="{width:profile.good+'%'}"></i><b>{{ profile.good }}%</b></span><span>狼人 <i class="wolf" :style="{width:profile.wolf+'%'}"></i><b>{{ profile.wolf }}%</b></span></div></div><div class="dashboard-honors"><div><p>MVP 次数</p><b>{{ profile.mvp }}</b></div><div><p>SVP 次数</p><b>{{ profile.svp }}</b></div></div></div>
                </div>
                <div class="mt-6 grid gap-7 md:grid-cols-[230px_minmax(0,1fr)]"><div><p class="font-bold text-violet-950">◎ 战力雷达图</p><svg viewBox="-35 -20 270 220" class="mt-2 w-60"><g v-for="level in [2,4,6,8,10]" :key="level" fill="none" stroke="#3f3f46" opacity=".48"><polygon :points="radarGrid(level*10)"/></g><polygon :points="radarPoints(profileRadar)" fill="rgba(139,92,246,.35)" stroke="#a855f7" stroke-width="2"/><g class="radar-axis-label"><text x="100" y="8" text-anchor="middle">带队能力 {{ profileRadar.leadership }}</text><text x="171" y="73">轮次操作 {{ profileRadar.operation }}</text><text x="151" y="171">逆风抗压 {{ profileRadar.resilience }}</text><text x="49" y="171" text-anchor="end">得分能力 {{ profileRadar.scoring }}</text><text x="29" y="73" text-anchor="end">站边投狼 {{ profileRadar.vote_wolf }}</text></g></svg></div><div><div class="flex items-center justify-between"><p class="font-bold text-violet-950">比赛记录</p><span class="text-xs text-violet-500">共 {{ profileRecords.length }} 条</span></div><div v-if="profileRecords.length" class="match-record-window mt-3"><component v-for="record in profileRecords" :key="record.id" :is="record.video_url?'a':'div'" :href="record.video_url||undefined" :target="record.video_url?'_blank':undefined" :rel="record.video_url?'noreferrer':undefined" class="match-record-item" :class="record.video_url?'match-record-link':''"><span>{{ seasonLabel(record.season_id) }} · {{ record.match_date||'未填写日期' }} · {{ record.role||'—' }} · {{ record.result||'—' }} · {{ record.score||0 }} 分</span><em v-if="record.video_url">观看录像 ↗</em></component></div><p v-else class="mt-3 rounded-xl bg-white/50 p-3 text-sm text-slate-500">暂无比赛记录。</p></div></div>
              </div>
              <div class="relative min-h-[420px] bg-gradient-to-br from-violet-200 via-white to-yellow-100"><img v-if="profile.portrait_path" :src="profile.portrait_path" class="absolute inset-0 h-full w-full object-cover object-top"/><div v-else class="grid h-full place-items-center"><div class="grid h-36 w-36 place-items-center rounded-full bg-white/60 text-6xl font-black text-violet-300">{{ profile.name.slice(0,1) }}</div><span class="absolute bottom-8 yellow-tag">暂无半身照</span></div></div>
            </div>
          </section>
        </template>

        <template v-else-if="page==='概览'">
          <div class="mt-8 flex items-center justify-between gap-4"><p class="text-violet-500">按赛季查看全部战队统计</p><select v-model="overviewSeasonId" class="archive-search"><option value="all">全部赛季</option><option v-for="item in seasons" :key="item.id" :value="item.id">{{ item.name }}</option></select></div>
          <section class="mt-5 grid gap-5 xl:grid-cols-[1.35fr_.75fr_.9fr]">
            <article class="metal-card p-6"><div class="flex items-start justify-between"><div><p class="text-sm font-bold text-violet-500">赛季总览</p><b class="chrome-title mt-2 block text-4xl">{{ totalScore }}</b><p class="mt-1 text-xs text-slate-500">总积分 · {{ overviewDays }} 个比赛日 · 日均 {{ overviewDailyScore.toFixed(1) }} 分</p></div><div class="text-right"><b class="text-2xl text-violet-950">{{ overviewStat?overviewStat.player_record_count:overviewRecords.length }}</b><p class="text-xs text-slate-500">已录入对局</p></div></div><div class="mt-5 grid grid-cols-2 gap-4 border-t border-violet-100 pt-4"><div><p class="text-sm font-bold">总胜率 <b class="ml-2 text-violet-700">{{ winRate.toFixed(1) }}%</b></p><p class="mt-1 text-xs text-slate-500">胜 {{ wins }} · 负 {{ overviewStat?overviewStat.loss_count:overviewRecords.length-wins }}</p></div><div class="space-y-2"><div v-for="item in [{label:'好人',value:selectedCampStats.good,style:'good'},{label:'狼人',value:selectedCampStats.wolf,style:'wolf'}]" :key="item.label"><div class="flex justify-between text-xs font-bold"><span>{{ item.label }}</span><span>{{ item.value.toFixed(1) }}%</span></div><div class="win-track"><i :class="'win-bar '+item.style" :style="{width:item.value+'%'}"></i></div></div></div></div></article>
            <article class="metal-card p-6"><p class="text-sm font-bold text-violet-500">MVP</p><b class="chrome-title mt-2 block text-4xl">{{ overviewMvp }}</b><div class="mt-3 flex items-center gap-2"><span class="text-xs text-slate-500">最近：</span><button v-for="player in recentMvpPlayers" :key="player.id" :title="'查看 '+player.name+' 档案'" class="mvp-player-link" @click="page='队员档案';openProfile(player)"><img v-if="player.portrait_path" :src="player.portrait_path" class="h-8 w-8 rounded-full object-cover"/><i v-else class="mvp-avatar">{{ player.name.slice(0,1) }}</i></button><span v-if="!recentMvpPlayers.length" class="text-xs text-slate-400">暂无</span></div><p class="mt-4 text-xs font-bold text-violet-500">擅长版型</p><div class="best-profile-tags mt-2"><span v-for="board in preferredBoards" :key="board.board_type" class="title-chip tone-0">{{ board.board_type }} · {{ board.win_rate }}%</span><span v-if="!preferredBoards.length" class="text-xs text-slate-400">暂无数据</span></div></article>
            <article class="metal-card p-5"><h2 class="chrome-title text-lg font-black">战队战力雷达图</h2><svg viewBox="-35 -20 270 220" class="team-radar mt-1"><g v-for="level in [2,4,6,8,10]" :key="level" fill="none" stroke="#3f3f46" opacity=".48"><polygon :points="radarGrid(level*10)"/></g><polygon :points="radarPoints(teamRadar)" fill="rgba(139,92,246,.35)" stroke="#a855f7" stroke-width="2"/><g class="radar-axis-label"><text x="100" y="8" text-anchor="middle">带队 {{ teamRadar.leadership }}</text><text x="171" y="73">操作 {{ teamRadar.operation }}</text><text x="151" y="171">抗压 {{ teamRadar.resilience }}</text><text x="49" y="171" text-anchor="end">得分 {{ teamRadar.scoring }}</text><text x="29" y="73" text-anchor="end">投狼 {{ teamRadar.vote_wolf }}</text></g></svg></article>
          </section>
          <section class="mt-5 grid gap-5 xl:grid-cols-[.9fr_1.1fr]"><article class="metal-card p-6"><div class="flex items-center justify-between"><div><h2 class="chrome-title text-xl font-black">12 位圆桌玄学胜率</h2><p class="mt-1 text-sm text-violet-500">绿色最佳、红色避雷；悬停查看详情</p></div><span v-if="seatHover" class="yellow-tag">{{ seatHover.seat }} 号位 · {{ seatHover.winRate.toFixed(1) }}%</span></div><div class="seat-table mt-5"><button v-for="item in seatStats" :key="item.seat" class="seat-node" :class="{best:seatBest?.seat===item.seat,worst:seatWorst?.seat===item.seat,active:hoverSeat===item.seat}" :style="{opacity:item.games?Math.max(.35,item.games/Math.max(...seatStats.map(row=>row.games),1)):0.18}" @mouseenter="hoverSeat=item.seat" @mouseleave="hoverSeat=null"><b>{{ item.seat }}</b><small>{{ item.games }}</small></button><div class="seat-center"><b>{{ seatBest?'最佳 '+seatBest.seat+'号 '+seatBest.winRate.toFixed(1)+'%':'暂无' }}</b><span>{{ seatWorst?'避雷 '+seatWorst.seat+'号 '+seatWorst.winRate.toFixed(1)+'%':'' }}</span></div></div></article><article class="metal-card p-6"><div class="flex items-end justify-between"><div><h2 class="chrome-title text-xl font-black">本赛季积分走势</h2><p class="mt-1 text-sm text-violet-500">按日期累计的真实积分</p></div><span class="yellow-tag">{{ selectedTrend.length }} 个节点</span></div><div class="mt-5 h-48"><svg viewBox="0 0 600 200" class="h-full w-full overflow-visible"><g stroke="#c4b5fd" opacity=".45"><line v-for="y in [30,80,130,180]" :key="y" x1="0" :y1="y" x2="600" :y2="y"/></g><polyline v-if="trendPoints" :points="trendPoints" fill="none" stroke="#8b5cf6" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><text v-else x="300" y="100" text-anchor="middle" fill="#a78bfa">暂无积分走势数据</text></svg></div><div class="mt-2 flex justify-between text-xs text-slate-400"><span>{{ selectedTrend[0]?.match_date||'—' }}</span><span>{{ selectedTrend[selectedTrend.length-1]?.match_date||'—' }}</span></div></article></section>
         </template>

        <template v-else-if="page==='排行榜'">
          <section class="mt-8"><div class="flex items-center justify-between gap-4"><p class="text-violet-500">按赛季查看三项队员总榜</p><select v-model="rankingSeasonId" class="archive-search"><option value="all">全部赛季</option><option v-for="item in seasons" :key="item.id" :value="item.id">{{ item.name }}</option></select></div><div class="leaderboard-grid mt-6"><article v-for="board in [{title:'总积分榜',metric:'总积分',players:scoreRanked,value:player=>player.points},{title:'总胜率榜',metric:'胜率',players:winRateRanked,value:player=>player.winRate+'%'},{title:'MVP 榜',metric:'MVP',players:mvpRanked,value:player=>player.mvp}]" :key="board.title" class="metal-card leaderboard-card"><div class="flex items-center justify-between border-b border-violet-100/80 p-5"><h2 class="chrome-title text-xl font-black">{{ board.title }}</h2><span class="yellow-tag">{{ board.players.length }} 人</span></div><div class="leaderboard-head"><span>排名</span><span>队员</span><span>{{ board.metric }}</span></div><div class="leaderboard-list"><div v-for="(player,index) in board.players" :key="player.id" class="leaderboard-row"><b>{{ index+1 }}</b><span class="flex min-w-0 items-center gap-2"><img v-if="player.portrait_path" :src="player.portrait_path" class="h-9 w-9 shrink-0 rounded-full object-cover"/><i v-else>{{ player.name.slice(0,1) }}</i><strong class="truncate">{{ player.name }}</strong></span><b class="text-violet-800">{{ board.value(player) }}</b></div><p v-if="!board.players.length" class="p-5 text-sm text-violet-400">暂无可排名数据。</p></div></article></div></section>
        </template>

        <template v-else-if="page==='队员档案'">
          <section class="mt-8"><div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p class="text-violet-500">横向滑动浏览，点击队员半身照进入专属数据页面</p><input v-model="playerSearch" class="archive-search" placeholder="按 ID 检索"/></div><div v-if="filteredMembers.length" class="scroll-row mt-6"><button v-for="player in filteredMembers" :key="player.id" class="player-card" @click="openProfile(player)"><div class="player-portrait relative bg-gradient-to-br from-violet-100 to-yellow-50"><img v-if="player.portrait_path" :src="player.portrait_path" class="h-full w-full object-cover object-top"/><div v-else class="grid h-full place-items-center"><b class="text-6xl text-violet-300">{{ player.name.slice(0,1) }}</b><span class="absolute bottom-4 text-xs text-violet-500">暂无半身照</span></div></div><div class="p-5 text-left"><b class="text-2xl text-violet-950">{{ player.name }}</b><div v-if="player.titles?.length" class="title-list mt-3"><span v-for="(title,index) in player.titles" :key="title" :class="titleTone(index)">{{ title }}</span></div><p v-else class="mt-3 text-sm text-violet-500">暂无称号</p></div></button></div><p v-else class="metal-card mt-6 p-10 text-center text-violet-500">没有匹配的队员。</p></section>
        </template>

        <template v-else-if="page==='录像库'">
          <section class="mt-8"><div class="flex items-center justify-between gap-4"><div><h2 class="chrome-title text-2xl font-black">观看录像</h2><p class="mt-1 text-violet-500">全部赛季录像，按赛季归档</p></div><button class="rounded-xl bg-white/60 px-3 py-2 text-sm font-bold text-violet-700" @click="refreshVideoMetadata">刷新录像信息</button></div><div v-for="group in videoGroups" :key="group.id" class="mt-8"><h3 class="chrome-title text-xl font-black">{{ group.name }}</h3><div class="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3"><a v-for="video in group.videos" :key="video.url" :href="video.url" target="_blank" rel="noreferrer" class="metal-card overflow-hidden"><img v-if="video.metadata?.cover_url" :src="video.metadata.cover_url" :alt="video.metadata.title" class="aspect-video w-full object-cover"/><div v-else class="grid aspect-video place-items-center bg-gradient-to-br from-slate-300 via-violet-200 to-yellow-100"><Clapperboard :size="54" class="text-violet-700"/></div><div class="p-5"><b>{{ video.metadata?.title||defaultVideoTitle(video) }}</b><p v-if="video.metadata?.owner_name" class="mt-2 text-xs text-violet-500">UP 主：{{ video.metadata.owner_name }}</p><p v-else class="mt-2 text-xs text-violet-500">等待封面与真实标题更新</p></div></a></div></div><p v-if="!videos.length" class="mt-6 text-violet-500">暂无录像链接。</p></section>
        </template>

        <template v-else-if="page==='对局录入'">
          <section class="metal-card mt-8 p-6">
            <div v-if="!recordingAuthorized" class="mx-auto max-w-md py-8 text-center">
              <h2 class="chrome-title text-2xl font-black">对局录入权限</h2>
              <p class="mt-2 text-sm text-violet-500">输入录入码后才可上传、编辑和写入对局数据。</p>
              <div class="mt-5 flex gap-3"><input v-model="recordingCode" class="archive-search flex-1" type="password" placeholder="输入录入码" @keyup.enter="authorizeRecording"/><button type="button" class="metal-button" @click="authorizeRecording">开启录入</button></div>
            </div>
            <form v-else @submit.prevent="submit">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div><h2 class="chrome-title text-2xl font-black">批量录入对局</h2><p class="mt-1 text-sm text-violet-500">阵营由身份自动识别；本局称号会自动换算对应分数。</p></div>
                <div class="flex gap-2"><label class="add-row cursor-pointer"><input class="hidden" type="file" accept="image/png,image/jpeg,image/webp" @change="recognizeSheet"/>{{ recognizingSheet?'正在识别…':'上传计分表识别' }}</label><button type="button" class="rounded-xl bg-white/60 px-3 py-2 text-sm" @click="loadData">刷新队员</button></div>
              </div>
              <div class="mt-5 grid gap-4 md:grid-cols-2"><label class="field">对局日期<input v-model="form.matchDate" type="date"/></label><label class="field">录像链接（可选）<input v-model="form.videoUrl" type="url" placeholder="https://..."/></label></div>
              <p class="mt-3 text-xs text-violet-500">胜负选择会直接写入；本局称号：MVP +2 分、SVP +1.5 分、背锅 −1 分。</p>
              <section class="entry-sheet mt-6" aria-label="本条对局记录">
                <div class="entry-sheet-head">
                  <div><span class="entry-kicker">本条记录</span><b>第 {{ entryPage+1 }} 条</b></div>
                  <div v-if="rows.length>1" class="entry-pagination">
                    <button type="button" :disabled="entryPage===0" @click="entryPage--">上一条</button>
                    <span>{{ entryPage+1 }} / {{ rows.length }}</span>
                    <button type="button" :disabled="entryPage===rows.length-1" @click="entryPage++">下一条</button>
                  </div>
                </div>
                <div class="entry-major-grid">
                  <label class="entry-field entry-primary">队员<select v-model="currentEntryRow.player"><option value="">选择队员</option><option v-for="player in players" :key="player.id" :value="player.name">{{ player.name }}</option></select></label>
                  <label class="entry-field entry-primary">身份<input v-model="currentEntryRow.role" placeholder="如：预言家"/></label>
                  <label class="entry-field entry-primary">结果<select v-model="currentEntryRow.result"><option value="">选择结果</option><option>胜利</option><option>失败</option></select></label>
                  <label class="entry-field">本局称号<select v-model="currentEntryRow.title"><option>无</option><option>MVP</option><option>SVP</option><option>背锅</option></select></label>
                </div>
                <div class="entry-number-grid">
                  <label class="entry-field">得分<input v-model.number="currentEntryRow.score" type="number" step="any" inputmode="decimal"/></label>
                  <label class="entry-field">座位<input v-model.number="currentEntryRow.seat_number" type="number" min="1"/></label>
                  <label class="entry-field">投狼数<input v-model.number="currentEntryRow.vote_wolf_count" type="number" min="0"/></label>
                  <label class="entry-field">投票分<input v-model.number="currentEntryRow.vote_score" type="number" step="any"/></label>
                  <label class="entry-field">行为分<input v-model.number="currentEntryRow.behavior_score" type="number" step="any"/></label>
                  <label class="entry-field entry-remarks">备注<input v-model="currentEntryRow.remarks" placeholder="可选"/></label>
                </div>
                <div class="entry-sheet-foot">
                  <span>阵营会按身份自动生成</span>
                  <button type="button" class="remove-row" :disabled="rows.length===1" @click="removeRow(entryPage)">删除本条</button>
                </div>
              </section>
              <div class="mt-5 flex gap-3"><button type="button" class="add-row" @click="addRow">+ 添加一条记录</button><button class="metal-button">提交 {{ rows.length }} 条记录</button></div>
            </form>
          </section>
        </template>
      </section>
    </div>
  </main>
</template>
