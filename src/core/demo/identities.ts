/**
 * Ключи кросс-подписи Ани — две личности, заранее подписанные (ed25519 по канонической JSON,
 * как у настоящего клиента): первая — с самого начала, вторая — после «Новые ключи»
 * (`DEMO_NEW_KEYS`). Rust-крипто запоминает первую увиденную личность, и смена на вторую —
 * ровно то, что видно, когда собеседник вошёл с нового телефона: полоса над лентой.
 *
 * Закрытых ключей здесь нет и не нужно: демо только отдаёт открытые, проверяет подписи
 * клиент. Заранее, а не на лету, — чтобы личность была одной и той же при каждой загрузке
 * страницы: иначе крипто, помнящее Аню с прошлого раза, видело бы смену на каждой.
 */
import { demoUsers } from './fixtures';

type Key = Record<string, unknown>;

export const anyaIdentities: ReadonlyArray<{ master_key: Key; self_signing_key: Key }> = [
  {
    master_key: {
      user_id: demoUsers.anya,
      usage: ['master'],
      keys: {
        'ed25519:WuIcjmql4bMoCvMgbbfYOpH9KVWGPDqpS1WjGK1pajY': 'WuIcjmql4bMoCvMgbbfYOpH9KVWGPDqpS1WjGK1pajY',
      },
    },
    self_signing_key: {
      user_id: demoUsers.anya,
      usage: ['self_signing'],
      keys: {
        'ed25519:j8nF02KjFrLUvXtzo+bLgvK75iRJtAGPn0wxxUTVe3o': 'j8nF02KjFrLUvXtzo+bLgvK75iRJtAGPn0wxxUTVe3o',
      },
      signatures: {
        [demoUsers.anya]: {
          'ed25519:WuIcjmql4bMoCvMgbbfYOpH9KVWGPDqpS1WjGK1pajY': 'IEgaBVCfajv+4T9vtNqctgTeLEJQv80ZRSYwBxyaqhPww8nTeZNaf+sjLjPpvnlmLYqwa1aOx6J0mUvNxmV9DQ',
        },
      },
    },
  },
  {
    master_key: {
      user_id: demoUsers.anya,
      usage: ['master'],
      keys: {
        'ed25519:2tI2xcWgeeuAfBXTYPA7x9xA8Uh1I1S1XULgfzntUbg': '2tI2xcWgeeuAfBXTYPA7x9xA8Uh1I1S1XULgfzntUbg',
      },
    },
    self_signing_key: {
      user_id: demoUsers.anya,
      usage: ['self_signing'],
      keys: {
        'ed25519:i4lxq4wv7/rrpYEVN3JZDmK6J6LH2udNl6NCQtIH0LI': 'i4lxq4wv7/rrpYEVN3JZDmK6J6LH2udNl6NCQtIH0LI',
      },
      signatures: {
        [demoUsers.anya]: {
          'ed25519:2tI2xcWgeeuAfBXTYPA7x9xA8Uh1I1S1XULgfzntUbg': 'MtxhMt8DAbXJrEFlyaQ91+UIvm9rwylsfeKU4n6dg0KJRGVldnW2yuc/yarxd+66mwFsxzXPgpQJ/cuQW2niDg',
        },
      },
    },
  },
];
