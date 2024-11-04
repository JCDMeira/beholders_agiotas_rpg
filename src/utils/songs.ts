import type { PaginateFunction } from 'astro';
import { getCollection } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Song } from '~/types';
import { APP_SONG } from 'astrowind:config';
import { cleanSlug, trimSlash, SONG_BASE, SONG_PERMALINK_PATTERN, CATEGORY_BASE, TAG_BASE } from './permalinks';

const generatePermalink = async ({
  id,
  slug,
  publishDate,
  category,
}: {
  id: string;
  slug: string;
  publishDate: Date;
  category: string | undefined;
}) => {
  const year = String(publishDate.getFullYear()).padStart(4, '0');
  const month = String(publishDate.getMonth() + 1).padStart(2, '0');
  const day = String(publishDate.getDate()).padStart(2, '0');
  const hour = String(publishDate.getHours()).padStart(2, '0');
  const minute = String(publishDate.getMinutes()).padStart(2, '0');
  const second = String(publishDate.getSeconds()).padStart(2, '0');

  const permalink = SONG_PERMALINK_PATTERN.replace('%slug%', slug)
    .replace('%id%', id)
    .replace('%category%', category || '')
    .replace('%year%', year)
    .replace('%month%', month)
    .replace('%day%', day)
    .replace('%hour%', hour)
    .replace('%minute%', minute)
    .replace('%second%', second);

  return permalink
    .split('/')
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
};

const getNormalizedSong = async (song: CollectionEntry<'song'>): Promise<Song> => {
  const { id, slug: rawSlug = '', data } = song;
  const { Content, remarkPluginFrontmatter } = await song.render();

  const {
    publishDate: rawPublishDate = new Date(),
    updateDate: rawUpdateDate,
    title,
    excerpt,
    image,
    tags: rawTags = [],
    category: rawCategory,
    author,
    draft = false,
    metadata = {},
  } = data;

  const slug = cleanSlug(rawSlug); // cleanSlug(rawSlug.split('/').pop());
  const publishDate = new Date(rawPublishDate);
  const updateDate = rawUpdateDate ? new Date(rawUpdateDate) : undefined;

  const category = rawCategory
    ? {
        slug: cleanSlug(rawCategory),
        title: rawCategory,
      }
    : undefined;

  const tags = rawTags.map((tag: string) => ({
    slug: cleanSlug(tag),
    title: tag,
  }));

  return {
    id: id,
    slug: slug,
    permalink: await generatePermalink({ id, slug, publishDate, category: category?.slug }),

    publishDate: publishDate,
    updateDate: updateDate,

    title: title,
    excerpt: excerpt,
    image: image,

    category: category,
    tags: tags,
    author: author,

    draft: draft,

    metadata,

    Content: Content,
    // or 'content' in case you consume from API

    readingTime: remarkPluginFrontmatter?.readingTime,
  };
};

const load = async function (): Promise<Array<Song>> {
  const songs = await getCollection('song');
  const normalizedSongs = songs.map(async (song) => await getNormalizedSong(song));

  const results = (await Promise.all(normalizedSongs))
    .sort((a, b) => a.publishDate.valueOf() - b.publishDate.valueOf())
    .filter((song) => !song.draft);

  return results;
};

let _songs: Array<Song>;

/** */
export const isBlogEnabled = APP_SONG.isEnabled;
export const isRelatedSongsEnabled = APP_SONG.isRelatedPostsEnabled;
export const isBlogListRouteEnabled = APP_SONG.list.isEnabled;
export const isBlogSongRouteEnabled = APP_SONG.post.isEnabled;
export const isBlogCategoryRouteEnabled = APP_SONG.category.isEnabled;
export const isBlogTagRouteEnabled = APP_SONG.tag.isEnabled;

export const blogListRobots = APP_SONG.list.robots;
export const blogSongRobots = APP_SONG.post.robots;
export const blogCategoryRobots = APP_SONG.category.robots;
export const blogTagRobots = APP_SONG.tag.robots;

export const blogSongsPerPage = APP_SONG?.songsPerPage;

/** */
export const fetchSongs = async (): Promise<Array<Song>> => {
  if (!_songs) {
    _songs = await load();
  }

  return _songs;
};

/** */
export const findSongsBySlugs = async (slugs: Array<string>): Promise<Array<Song>> => {
  if (!Array.isArray(slugs)) return [];

  const songs = await fetchSongs();

  return slugs.reduce(function (r: Array<Song>, slug: string) {
    songs.some(function (song: Song) {
      return slug === song.slug && r.push(song);
    });
    return r;
  }, []);
};

/** */
export const findSongsByIds = async (ids: Array<string>): Promise<Array<Song>> => {
  if (!Array.isArray(ids)) return [];

  const songs = await fetchSongs();

  return ids.reduce(function (r: Array<Song>, id: string) {
    songs.some(function (song: Song) {
      return id === song.id && r.push(song);
    });
    return r;
  }, []);
};

/** */
export const findLatestSongs = async ({ count }: { count?: number }): Promise<Array<Song>> => {
  const _count = count || 4;
  const songs = await fetchSongs();

  return songs ? songs.slice(0, _count) : [];
};

/** */
export const getStaticPathsBlogList = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isBlogEnabled || !isBlogListRouteEnabled) return [];
  return paginate(await fetchSongs(), {
    params: { song: SONG_BASE || undefined },
    pageSize: blogSongsPerPage,
  });
};

/** */
export const getStaticPathsBlogSong = async () => {
  if (!isBlogEnabled || !isBlogSongRouteEnabled) return [];
  return (await fetchSongs()).flatMap((song) => ({
    params: {
      song: song.permalink,
    },
    props: { song },
  }));
};

/** */
export const getStaticPathsBlogCategory = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isBlogEnabled || !isBlogCategoryRouteEnabled) return [];

  const songs = await fetchSongs();
  const categories = {};
  songs.map((song) => {
    song.category?.slug && (categories[song.category?.slug] = song.category);
  });

  return Array.from(Object.keys(categories)).flatMap((categorySlug) =>
    paginate(
      songs.filter((song) => song.category?.slug && categorySlug === song.category?.slug),
      {
        params: { category: categorySlug, song: CATEGORY_BASE || undefined },
        pageSize: blogSongsPerPage,
        props: { category: categories[categorySlug] },
      }
    )
  );
};

/** */
export const getStaticPathsBlogTag = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isBlogEnabled || !isBlogTagRouteEnabled) return [];

  const songs = await fetchSongs();
  const tags = {};
  songs.map((song) => {
    Array.isArray(song.tags) &&
      song.tags.map((tag) => {
        tags[tag?.slug] = tag;
      });
  });

  return Array.from(Object.keys(tags)).flatMap((tagSlug) =>
    paginate(
      songs.filter((song) => Array.isArray(song.tags) && song.tags.find((elem) => elem.slug === tagSlug)),
      {
        params: { tag: tagSlug, song: TAG_BASE || undefined },
        pageSize: blogSongsPerPage,
        props: { tag: tags[tagSlug] },
      }
    )
  );
};

/** */
export async function getRelatedSongs(originalSong: Song, maxResults: number = 4): Promise<Song[]> {
  const allSongs = await fetchSongs();
  const originalTagsSet = new Set(originalSong.tags ? originalSong.tags.map((tag) => tag.slug) : []);

  const songsWithScores = allSongs.reduce((acc: { song: Song; score: number }[], iteratedSong: Song) => {
    if (iteratedSong.slug === originalSong.slug) return acc;

    let score = 0;
    if (iteratedSong.category && originalSong.category && iteratedSong.category.slug === originalSong.category.slug) {
      score += 5;
    }

    if (iteratedSong.tags) {
      iteratedSong.tags.forEach((tag) => {
        if (originalTagsSet.has(tag.slug)) {
          score += 1;
        }
      });
    }

    acc.push({ song: iteratedSong, score });
    return acc;
  }, []);

  songsWithScores.sort((a, b) => b.score - a.score);

  const selectedSongs: Song[] = [];
  let i = 0;
  while (selectedSongs.length < maxResults && i < songsWithScores.length) {
    selectedSongs.push(songsWithScores[i].song);
    i++;
  }

  return selectedSongs;
}
