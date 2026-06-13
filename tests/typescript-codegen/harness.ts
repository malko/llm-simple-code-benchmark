// Hidden grading harness — copied next to the agent's lru-cache.ts and
// compiled/run by test.ts. Not part of the agent's workspace (context/).
import { LRUCache } from './lru-cache';

const results: Record<string, boolean> = {};

// 1. basic put/get
{
  const cache = new LRUCache<string, number>(2);
  cache.put('a', 1);
  cache.put('b', 2);
  results.basicGet = cache.get('a') === 1 && cache.get('b') === 2;
}

// 2. missing key
{
  const cache = new LRUCache<string, number>(2);
  results.missingKey = cache.get('x') === undefined;
}

// 3. size
{
  const cache = new LRUCache<string, number>(3);
  cache.put('a', 1);
  cache.put('b', 2);
  results.size = cache.size() === 2;
}

// 4. eviction of least-recently-used entry
{
  const cache = new LRUCache<string, number>(2);
  cache.put('a', 1);
  cache.put('b', 2);
  cache.get('a'); // 'a' is now most-recently-used; 'b' is LRU
  cache.put('c', 3); // should evict 'b'
  results.evictsLRU =
    cache.get('b') === undefined && cache.get('a') === 1 && cache.get('c') === 3;
}

// 5. updating an existing key refreshes its recency without evicting it
{
  const cache = new LRUCache<string, number>(2);
  cache.put('a', 1);
  cache.put('b', 2);
  cache.put('a', 10); // update 'a' -> 'a' becomes MRU, 'b' becomes LRU
  cache.put('c', 3); // should evict 'b', not 'a'
  results.updateRefreshesRecency =
    cache.get('a') === 10 && cache.get('b') === undefined && cache.get('c') === 3;
}

console.log(JSON.stringify(results));
