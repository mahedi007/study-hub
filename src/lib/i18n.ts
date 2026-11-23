import { useEffect, useState } from 'react';

export type Lang = 'bn' | 'en';

const dict = {
  search: { bn: 'খুঁজুন…', en: 'Search…' },
  all: { bn: 'সব', en: 'All' },
  materials: { bn: 'উপকরণ', en: 'Materials' },
  collections: { bn: 'সংগ্রহ', en: 'Collections' },
  download: { bn: 'ডাউনলোড', en: 'Download' },
  open: { bn: 'খুলুন', en: 'Open' },
  back: { bn: 'ফিরে যান', en: 'Back' },
  share: { bn: 'শেয়ার', en: 'Share' },
  copy_link: { bn: 'লিংক কপি', en: 'Copy link' },
  copied: { bn: 'কপি হয়েছে', en: 'Copied' },
  passcode_title: { bn: 'এই উপকরণটি পাসকোড দিয়ে সুরক্ষিত', en: 'This material is protected' },
  passcode_hint: { bn: 'আপনার শিক্ষকের দেওয়া পাসকোড লিখুন', en: 'Enter the passcode your teacher gave you' },
  unlock: { bn: 'খুলুন', en: 'Unlock' },
  wrong_passcode: { bn: 'পাসকোড সঠিক নয়', en: 'Wrong passcode' },
  items: { bn: 'টি আইটেম', en: 'items' },
  views: { bn: 'বার দেখা হয়েছে', en: 'views' },
  mark_done: { bn: 'শেষ করেছি', en: 'Mark done' },
  done: { bn: 'শেষ', en: 'Done' },
  next: { bn: 'পরবর্তী', en: 'Next' },
  previous: { bn: 'আগের', en: 'Previous' },
  progress: { bn: 'অগ্রগতি', en: 'Progress' },
  pinned: { bn: 'গুরুত্বপূর্ণ', en: 'Pinned' },
  no_materials: { bn: 'কোনো উপকরণ পাওয়া যায়নি', en: 'No materials found' },
  loading: { bn: 'লোড হচ্ছে…', en: 'Loading…' },
  open_new_tab: { bn: 'নতুন ট্যাবে খুলুন', en: 'Open in new tab' },
  fullscreen: { bn: 'পূর্ণ পর্দা', en: 'Full screen' },
  speed: { bn: 'গতি', en: 'Speed' },
  teachers: { bn: 'শিক্ষকবৃন্দ', en: 'Teachers' },
  recent: { bn: 'সাম্প্রতিক উপকরণ', en: 'Recently added' },
  empty_collection: { bn: 'এই সংগ্রহে এখনো কিছু নেই', en: 'This collection is empty' },
  not_ready: { bn: 'ফাইলটি এখনো প্রস্তুত নয়', en: 'This file is not ready yet' },
  not_found: { bn: 'খুঁজে পাওয়া যায়নি', en: 'Not found' },
  home: { bn: 'হোম', en: 'Home' },
  contents: { bn: 'সূচিপত্র', en: 'Contents' },
  page_count: { bn: 'পৃষ্ঠা', en: 'Page' },
  zoom: { bn: 'জুম', en: 'Zoom' },
  materials_count: { bn: 'উপকরণ', en: 'materials' },
  collections_count: { bn: 'সংগ্রহ', en: 'collections' },
  total_views: { bn: 'মোট দেখা', en: 'total views' },
  subject: { bn: 'বিষয়', en: 'Subject' },
  class_level: { bn: 'শ্রেণি', en: 'Class' },
  type: { bn: 'ধরন', en: 'Type' },
  call: { bn: 'কল করুন', en: 'Call' },
} as const;

export type I18nKey = keyof typeof dict;

export function t(lang: Lang, key: I18nKey): string {
  return dict[key]?.[lang] ?? key;
}

const STORAGE_KEY = 'studyhub.lang';

function readLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'bn' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Language for public pages: the student's saved choice wins, otherwise the teacher's default. */
export function useLang(fallback: Lang = 'bn') {
  const [lang, setLangState] = useState<Lang>(() => readLang() ?? fallback);
  useEffect(() => {
    if (!readLang()) setLangState(fallback);
  }, [fallback]);
  const setLang = (l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    setLangState(l);
  };
  return [lang, setLang] as const;
}
