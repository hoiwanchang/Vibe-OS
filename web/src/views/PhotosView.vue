<script setup lang="ts">
/**
 * 照片管理窗口（Phase 5）
 * 时间线 / 相册 / 灯箱三种模式
 */
import { onMounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { photosApi } from '@/api';
import type { PhotoTimelineGroup, PhotoAlbum, PhotoItem } from '@/api/types';

const { t } = useI18n();
const loading = ref(false);
const viewMode = ref<'timeline' | 'albums'>('timeline');
const timeline = ref<PhotoTimelineGroup[]>([]);
const albums = ref<PhotoAlbum[]>([]);

/* 灯箱 */
const lightboxVisible = ref(false);
const lightboxPhotos = ref<PhotoItem[]>([]);
const lightboxIndex = ref(0);
const currentPhoto = computed(() => lightboxPhotos.value[lightboxIndex.value] ?? null);

/* 创建相册 */
const showAlbumDialog = ref(false);
const albumForm = ref({ name: '', description: '' });

onMounted(async () => { await loadTimeline(); await loadAlbums(); });

async function loadTimeline(): Promise<void> {
  loading.value = true;
  try { timeline.value = await photosApi.getLibrary(); }
  catch { /* 演示模式降级 */ }
  finally { loading.value = false; }
}

async function loadAlbums(): Promise<void> {
  try { albums.value = await photosApi.getAlbums(); }
  catch { /* 演示模式降级 */ }
}

function openLightbox(photos: PhotoItem[], index: number): void {
  lightboxPhotos.value = photos;
  lightboxIndex.value = index;
  lightboxVisible.value = true;
}

function prevPhoto(): void {
  if (lightboxIndex.value > 0) lightboxIndex.value--;
}

function nextPhoto(): void {
  if (lightboxIndex.value < lightboxPhotos.value.length - 1) lightboxIndex.value++;
}

async function createAlbum(): Promise<void> {
  if (!albumForm.value.name) { ElMessage.warning(t('photos.invalidName')); return; }
  try {
    await photosApi.createAlbum(albumForm.value);
    ElMessage.success(t('photos.albumCreated'));
    showAlbumDialog.value = false;
    albumForm.value = { name: '', description: '' };
    await loadAlbums();
  } catch (err) { ElMessage.error(err instanceof Error ? err.message : String(err)); }
}

async function deleteAlbum(album: PhotoAlbum): Promise<void> {
  try {
    await ElMessageBox.confirm(t('photos.deleteAlbumConfirm', { name: album.name }), t('common.warning'), { type: 'warning' });
    await photosApi.deleteAlbum(album.id);
    ElMessage.success(t('common.deleted'));
    await loadAlbums();
  } catch { /* cancelled */ }
}

function thumbUrl(photo: PhotoItem): string {
  return `/api/photos/${photo.id}/thumbnail`;
}

function originalUrl(photo: PhotoItem): string {
  return `/api/photos/${photo.id}/original`;
}

function formatDate(dateStr: string): string {
  return dateStr;
}
</script>

<template>
  <div class="photos-view">
    <!-- 工具栏 -->
    <div class="photos-toolbar">
      <div class="photos-tabs">
        <button class="photos-tab" :class="{ active: viewMode === 'timeline' }" @click="viewMode = 'timeline'">{{ t('photos.timeline') }}</button>
        <button class="photos-tab" :class="{ active: viewMode === 'albums' }" @click="viewMode = 'albums'">{{ t('photos.albums') }}</button>
      </div>
      <el-button size="small" type="primary" @click="showAlbumDialog = true">{{ t('photos.createAlbum') }}</el-button>
    </div>

    <!-- 时间线视图 -->
    <div v-if="viewMode === 'timeline'" v-loading="loading" class="photos-timeline">
      <div v-for="group in timeline" :key="group.date" class="timeline-group">
        <div class="timeline-date nx-mono">{{ formatDate(group.date) }}</div>
        <div class="timeline-grid">
          <div v-for="(photo, idx) in group.photos" :key="photo.id" class="photo-thumb" @click="openLightbox(group.photos, idx)">
            <img :src="thumbUrl(photo)" :alt="photo.filename" loading="lazy" />
          </div>
        </div>
      </div>
      <div v-if="timeline.length === 0 && !loading" class="photos-empty nx-text-dim">{{ t('photos.empty') }}</div>
    </div>

    <!-- 相册视图 -->
    <div v-if="viewMode === 'albums'" class="photos-albums">
      <div v-for="album in albums" :key="album.id" class="album-card">
        <div class="album-cover">
          <img v-if="album.coverId" :src="thumbUrl({ id: album.coverId } as PhotoItem)" :alt="album.name" />
          <div v-else class="album-cover-placeholder nx-mono">{{ album.photoCount }}</div>
        </div>
        <div class="album-info">
          <div class="album-name">{{ album.name }}</div>
          <div class="album-meta nx-text-dim">{{ album.photoCount }} {{ t('photos.photoUnit') }}</div>
        </div>
        <el-button size="small" text type="danger" @click="deleteAlbum(album)">{{ t('common.delete') }}</el-button>
      </div>
      <div v-if="albums.length === 0" class="photos-empty nx-text-dim">{{ t('photos.noAlbums') }}</div>
    </div>

    <!-- 灯箱 -->
    <el-dialog v-model="lightboxVisible" :show-close="true" width="90%" top="5vh" class="lightbox-dialog">
      <div v-if="currentPhoto" class="lightbox-content">
        <img :src="originalUrl(currentPhoto)" :alt="currentPhoto.filename" class="lightbox-img" />
        <div class="lightbox-info nx-mono">
          <span>{{ currentPhoto.filename }}</span>
          <span v-if="currentPhoto.takenAt">{{ currentPhoto.takenAt }}</span>
          <span v-if="currentPhoto.camera">{{ currentPhoto.camera }}</span>
          <span>{{ lightboxIndex + 1 }} / {{ lightboxPhotos.length }}</span>
        </div>
        <button class="lightbox-nav lightbox-prev" @click="prevPhoto">‹</button>
        <button class="lightbox-nav lightbox-next" @click="nextPhoto">›</button>
      </div>
    </el-dialog>

    <!-- 创建相册 -->
    <el-dialog v-model="showAlbumDialog" :title="t('photos.createAlbum')" width="400px">
      <el-form label-position="top">
        <el-form-item :label="t('photos.albumName')">
          <el-input v-model="albumForm.name" />
        </el-form-item>
        <el-form-item :label="t('photos.albumDesc')">
          <el-input v-model="albumForm.description" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAlbumDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="createAlbum">{{ t('photos.createAlbum') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.photos-view { display: flex; flex-direction: column; height: 100%; }
.photos-toolbar { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--nx-border-faint); }
.photos-tabs { display: flex; gap: 4px; }
.photos-tab { background: none; border: 1px solid var(--nx-border-faint); color: var(--nx-text-dim); padding: 4px 12px; font-size: 12px; cursor: pointer; }
.photos-tab.active { color: var(--nx-amber); border-color: var(--nx-amber); }
.photos-timeline { flex: 1; overflow-y: auto; padding: 12px; }
.timeline-group { margin-bottom: 16px; }
.timeline-date { font-size: 13px; font-weight: 700; margin-bottom: 8px; color: var(--nx-amber); }
.timeline-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px; }
.photo-thumb { aspect-ratio: 1; overflow: hidden; cursor: pointer; border: 1px solid var(--nx-border-faint); }
.photo-thumb img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.2s; }
.photo-thumb:hover img { transform: scale(1.05); }
.photos-albums { flex: 1; overflow-y: auto; padding: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; align-content: start; }
.album-card { border: 1px solid var(--nx-border-faint); padding: 8px; }
.album-cover { aspect-ratio: 1; overflow: hidden; margin-bottom: 8px; background: var(--nx-bg-secondary); }
.album-cover img { width: 100%; height: 100%; object-fit: cover; }
.album-cover-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; font-size: 24px; color: var(--nx-text-faint); }
.album-info { margin-bottom: 4px; }
.album-name { font-size: 13px; font-weight: 600; }
.album-meta { font-size: 11px; }
.photos-empty { text-align: center; padding: 48px; }
.lightbox-content { position: relative; text-align: center; }
.lightbox-img { max-width: 100%; max-height: 70vh; object-fit: contain; }
.lightbox-info { display: flex; justify-content: center; gap: 16px; margin-top: 8px; font-size: 12px; color: var(--nx-text-dim); }
.lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); background: rgba(0,0,0,0.5); color: #fff; border: none; font-size: 32px; padding: 8px 16px; cursor: pointer; }
.lightbox-prev { left: 8px; }
.lightbox-next { right: 8px; }
</style>
