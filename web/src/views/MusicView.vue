<script setup lang="ts">
/**
 * 音乐播放器窗口（Phase 5）
 * 艺术家/专辑/曲目浏览 + 播放列表 + Web 播放器
 */
import { onMounted, ref, computed, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { musicApi } from '@/api';
import type { MusicArtist, MusicAlbum, MusicTrack, MusicPlaylist } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const browseMode = ref<'artists' | 'albums' | 'tracks' | 'playlists'>('artists');

const artists = ref<MusicArtist[]>([]);
const albums = ref<MusicAlbum[]>([]);
const tracks = ref<MusicTrack[]>([]);
const playlists = ref<MusicPlaylist[]>([]);

/* 播放器状态 */
const currentTrack = ref<MusicTrack | null>(null);
const isPlaying = ref(false);
const progress = ref(0);
const duration = ref(0);
const audioEl = ref<HTMLAudioElement | null>(null);

/* 创建播放列表 */
const showPlaylistDialog = ref(false);
const playlistForm = ref({ name: '', trackIds: [] as string[] });

onMounted(async () => {
  await loadArtists();
  await loadAlbums();
  await loadTracks();
  await loadPlaylists();
});

onUnmounted(() => {
  if (audioEl.value) { audioEl.value.pause(); audioEl.value = null; }
});

async function loadArtists(): Promise<void> {
  loading.value = true;
  try { artists.value = await musicApi.getArtists(); }
  catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
}

async function loadAlbums(artistId?: string): Promise<void> {
  try { albums.value = await musicApi.getAlbums(artistId ? { artistId } : undefined); }
  catch { /* 演示模式降级 */ }
}

async function loadTracks(params?: { artistId?: string; albumId?: string }): Promise<void> {
  try { tracks.value = await musicApi.getTracks(params); }
  catch { /* 演示模式降级 */ }
}

async function loadPlaylists(): Promise<void> {
  try { playlists.value = await musicApi.getPlaylists(); }
  catch { /* 演示模式降级 */ }
}

function playTrack(track: MusicTrack): void {
  currentTrack.value = track;
  isPlaying.value = true;
  progress.value = 0;

  if (!audioEl.value) {
    audioEl.value = new Audio();
    audioEl.value.addEventListener('timeupdate', () => {
      if (audioEl.value) {
        progress.value = audioEl.value.currentTime;
        duration.value = audioEl.value.duration || 0;
      }
    });
    audioEl.value.addEventListener('ended', () => { isPlaying.value = false; });
  }
  audioEl.value.src = musicApi.streamUrl(track.id);
  audioEl.value.play().catch(() => { isPlaying.value = false; });
}

function togglePlay(): void {
  if (!audioEl.value || !currentTrack.value) return;
  if (isPlaying.value) { audioEl.value.pause(); isPlaying.value = false; }
  else { audioEl.value.play().catch(() => {}); isPlaying.value = true; }
}

function seek(val: number): void {
  if (audioEl.value) { audioEl.value.currentTime = val; progress.value = val; }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function createPlaylist(): Promise<void> {
  if (!playlistForm.value.name) { ElMessage.warning(t('music.invalidName')); return; }
  try {
    await musicApi.createPlaylist(playlistForm.value);
    ElMessage.success(t('music.playlistCreated'));
    showPlaylistDialog.value = false;
    playlistForm.value = { name: '', trackIds: [] };
    await loadPlaylists();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

async function deletePlaylist(pl: MusicPlaylist): Promise<void> {
  try {
    await ElMessageBox.confirm(t('music.deletePlaylistConfirm', { name: pl.name }), t('common.warning'), { type: 'warning' });
    await musicApi.deletePlaylist(pl.id);
    ElMessage.success(t('common.deleted'));
    await loadPlaylists();
  } catch { /* cancelled */ }
}

function coverUrl(album: MusicAlbum): string {
  return album.coverPath ?? '';
}

const currentCover = computed(() => {
  if (!currentTrack.value) return '';
  return musicApi.coverUrl(currentTrack.value.id);
});
</script>

<template>
  <div class="music-view">
    <!-- 浏览区 -->
    <div class="music-browse">
      <div class="music-tabs">
        <button class="music-tab" :class="{ active: browseMode === 'artists' }" @click="browseMode = 'artists'; loadArtists()">{{ t('music.artists') }}</button>
        <button class="music-tab" :class="{ active: browseMode === 'albums' }" @click="browseMode = 'albums'; loadAlbums()">{{ t('music.albums') }}</button>
        <button class="music-tab" :class="{ active: browseMode === 'tracks' }" @click="browseMode = 'tracks'; loadTracks()">{{ t('music.tracks') }}</button>
        <button class="music-tab" :class="{ active: browseMode === 'playlists' }" @click="browseMode = 'playlists'; loadPlaylists()">{{ t('music.playlists') }}</button>
      </div>

      <div v-loading="loading" class="music-list">
        <!-- 艺术家 -->
        <template v-if="browseMode === 'artists'">
          <div v-for="artist in artists" :key="artist.id" class="music-row" @click="browseMode = 'albums'; loadAlbums(artist.id)">
            <span class="music-row-name">{{ artist.name }}</span>
            <span class="music-row-meta nx-text-dim">{{ artist.albumCount }} {{ t('music.albumUnit') }} · {{ artist.trackCount }} {{ t('music.trackUnit') }}</span>
          </div>
          <div v-if="artists.length === 0" class="music-empty nx-text-dim">{{ t('music.empty') }}</div>
        </template>

        <!-- 专辑 -->
        <template v-if="browseMode === 'albums'">
          <div v-for="album in albums" :key="album.id" class="music-album-card" @click="browseMode = 'tracks'; loadTracks({ albumId: album.id })">
            <div class="album-thumb">
              <img v-if="album.coverPath" :src="coverUrl(album)" :alt="album.name" />
              <div v-else class="album-thumb-placeholder nx-mono">♪</div>
            </div>
            <div class="album-detail">
              <div class="album-title">{{ album.name }}</div>
              <div class="album-artist nx-text-dim">{{ album.artistName }}<span v-if="album.year"> · {{ album.year }}</span></div>
            </div>
          </div>
          <div v-if="albums.length === 0" class="music-empty nx-text-dim">{{ t('music.empty') }}</div>
        </template>

        <!-- 曲目 -->
        <template v-if="browseMode === 'tracks'">
          <div v-for="track in tracks" :key="track.id" class="music-row music-track-row" @click="playTrack(track)">
            <span class="track-num nx-mono">{{ track.trackNumber }}</span>
            <span class="music-row-name">{{ track.title }}</span>
            <span class="music-row-meta nx-text-dim">{{ track.artistName }} — {{ track.albumName }}</span>
            <span class="track-dur nx-mono">{{ formatTime(track.duration) }}</span>
            <span v-if="currentTrack?.id === track.id" class="track-playing">▶</span>
          </div>
          <div v-if="tracks.length === 0" class="music-empty nx-text-dim">{{ t('music.empty') }}</div>
        </template>

        <!-- 播放列表 -->
        <template v-if="browseMode === 'playlists'">
          <div class="music-playlist-header">
            <el-button size="small" type="primary" @click="showPlaylistDialog = true">{{ t('music.createPlaylist') }}</el-button>
          </div>
          <div v-for="pl in playlists" :key="pl.id" class="music-row">
            <span class="music-row-name">{{ pl.name }}</span>
            <span class="music-row-meta nx-text-dim">{{ pl.trackCount }} {{ t('music.trackUnit') }}</span>
            <el-button size="small" text type="danger" @click.stop="deletePlaylist(pl)">{{ t('common.delete') }}</el-button>
          </div>
          <div v-if="playlists.length === 0" class="music-empty nx-text-dim">{{ t('music.noPlaylists') }}</div>
        </template>
      </div>
    </div>

    <!-- 播放器栏 -->
    <div class="music-player" :class="{ active: !!currentTrack }">
      <template v-if="currentTrack">
        <img v-if="currentCover" :src="currentCover" class="player-cover" :alt="currentTrack.title" />
        <div v-else class="player-cover-placeholder nx-mono">♪</div>
        <div class="player-info">
          <div class="player-title">{{ currentTrack.title }}</div>
          <div class="player-artist nx-text-dim">{{ currentTrack.artistName }}</div>
        </div>
        <button class="player-btn" @click="togglePlay">{{ isPlaying ? '⏸' : '▶' }}</button>
        <div class="player-progress">
          <span class="nx-mono">{{ formatTime(progress) }}</span>
          <input type="range" :min="0" :max="duration || 1" :value="progress" class="player-slider" @input="seek(Number(($event.target as HTMLInputElement).value))" />
          <span class="nx-mono">{{ formatTime(duration) }}</span>
        </div>
      </template>
      <div v-else class="player-idle nx-text-dim">{{ t('music.noTrack') }}</div>
    </div>

    <!-- 创建播放列表 -->
    <el-dialog v-model="showPlaylistDialog" :title="t('music.createPlaylist')" width="400px">
      <el-form label-position="top">
        <el-form-item :label="t('music.playlistName')">
          <el-input v-model="playlistForm.name" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showPlaylistDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createPlaylist">{{ t('music.createPlaylist') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.music-view { display: flex; flex-direction: column; height: 100%; }
.music-browse { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.music-tabs { display: flex; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--nx-border-faint); }
.music-tab { background: none; border: 1px solid var(--nx-border-faint); color: var(--nx-text-dim); padding: 4px 12px; font-size: 12px; cursor: pointer; }
.music-tab.active { color: var(--nx-amber); border-color: var(--nx-amber); }
.music-list { flex: 1; overflow-y: auto; padding: 8px 12px; }
.music-row { display: flex; align-items: center; gap: 12px; padding: 8px 4px; border-bottom: 1px solid var(--nx-border-faint); cursor: pointer; }
.music-row:hover { background: var(--nx-bg-secondary); }
.music-row-name { font-size: 13px; font-weight: 500; }
.music-row-meta { font-size: 11px; margin-left: auto; }
.music-track-row .track-num { width: 24px; text-align: right; font-size: 11px; color: var(--nx-text-faint); }
.track-dur { font-size: 11px; color: var(--nx-text-faint); }
.track-playing { color: var(--nx-amber); font-size: 10px; }
.music-album-card { display: flex; gap: 12px; padding: 8px 4px; border-bottom: 1px solid var(--nx-border-faint); cursor: pointer; align-items: center; }
.music-album-card:hover { background: var(--nx-bg-secondary); }
.album-thumb { width: 48px; height: 48px; overflow: hidden; flex-shrink: 0; background: var(--nx-bg-secondary); }
.album-thumb img { width: 100%; height: 100%; object-fit: cover; }
.album-thumb-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 20px; color: var(--nx-text-faint); }
.album-title { font-size: 13px; font-weight: 500; }
.album-artist { font-size: 11px; }
.music-empty { text-align: center; padding: 32px; }
.music-playlist-header { margin-bottom: 8px; }

/* 播放器栏 */
.music-player { border-top: 1px solid var(--nx-border-faint); padding: 8px 12px; display: flex; align-items: center; gap: 12px; min-height: 56px; }
.music-player:not(.active) { justify-content: center; }
.player-cover { width: 40px; height: 40px; object-fit: cover; }
.player-cover-placeholder { width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: var(--nx-bg-secondary); font-size: 18px; color: var(--nx-text-faint); }
.player-info { min-width: 120px; }
.player-title { font-size: 13px; font-weight: 600; }
.player-artist { font-size: 11px; }
.player-btn { background: none; border: 1px solid var(--nx-border-faint); color: var(--nx-amber); width: 36px; height: 36px; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
.player-btn:hover { border-color: var(--nx-amber); }
.player-progress { flex: 1; display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--nx-text-dim); }
.player-slider { flex: 1; accent-color: var(--nx-amber); }
.player-idle { font-size: 12px; }
</style>
