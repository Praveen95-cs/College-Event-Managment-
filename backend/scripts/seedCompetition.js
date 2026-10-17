const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Competition = require('../models/Competition');
const User = require('../models/User');

async function seed() {
  const localUri = process.env.MONGODB_URI_LOCAL || 'mongodb://127.0.0.1:27017/college-event-manager';
  try {
    await mongoose.connect(localUri, { serverSelectionTimeoutMS: 3000 });
  } catch {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  }

  const admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    console.error('No admin user found to seed competition.');
    process.exit(1);
  }

  const existing = await Competition.findOne({ title: 'Campus AI & Data Structures Championship' });
  if (existing) {
    console.log('Sample competition already exists:', existing._id);
    process.exit(0);
  }

  const now = new Date();
  const startTime = new Date(now.getTime() - 10 * 60 * 1000); // Started 10 mins ago (LIVE)
  const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // Ends in 7 days

  const comp = await Competition.create({
    title: 'Campus AI & Data Structures Championship',
    description: 'An elite challenge covering algorithms, data structures, and optimization. Features personalized question sets powered by Google Gemini and real-time execution via Judge0.',
    organizer: admin._id,
    type: 'hybrid',
    prompt: 'University-level computer science contest covering arrays, trees, and time complexity',
    topics: ['Arrays', 'Trees', 'Time Complexity', 'Dynamic Programming'],
    difficulty: 'medium',
    durationMinutes: 45,
    totalMarks: 50,
    negativeMarking: 0.25,
    startTime,
    endTime,
    participantLimit: 100,
    permittedLanguages: ['cpp', 'python', 'java', 'javascript'],
    questionsPerParticipant: 3,
    status: 'published',
    questionPool: [
      {
        questionId: 'q_algo_1',
        type: 'mcq',
        question: 'Which of the following data structures provides the most optimal worst-case search time complexity for maintaining a dynamic sorted set of keys?',
        options: ['Red-Black Self-Balancing BST', 'Unsorted Doubly Linked List', 'Linear Hash Table without chaining', 'Splay Tree with amortized bounds'],
        correctOption: 0,
        explanation: 'Red-Black trees guarantee strict O(log N) worst-case time for search, insertion, and deletion operations.',
        topic: 'Data Structures',
        difficulty: 'medium',
        marks: 5
      },
      {
        questionId: 'q_algo_2',
        type: 'mcq',
        question: 'What is the tight asymptotic lower bound for comparison-based sorting algorithms in the decision tree model?',
        options: ['Omega(N log N)', 'Omega(N)', 'Omega(N^2)', 'Omega(log N)'],
        correctOption: 0,
        explanation: 'Any comparison-based sorting algorithm requires at least Omega(N log N) comparisons in the worst case.',
        topic: 'Algorithms',
        difficulty: 'easy',
        marks: 5
      },
      {
        problemId: 'p_coding_1',
        type: 'coding',
        title: 'Two Sum Target Counter',
        description: 'Given an array of integers and a target integer T, find the number of unique pairs (i, j) where i < j and A[i] + A[j] == T.\n\nInput:\nFirst line contains two integers: N (size of array) and T (target sum).\nSecond line contains N space-separated integers.\n\nOutput:\nPrint a single integer: the count of matching pairs.',
        inputFormat: 'N T on line 1, followed by N integers on line 2.',
        outputFormat: 'Print the count of matching pairs.',
        constraints: '1 <= N <= 10^5, -10^9 <= A[i], T <= 10^9',
        difficulty: 'medium',
        marks: 40,
        starterCode: {
          python: `import sys

def solve():
    lines = sys.stdin.read().strip().split()
    if not lines:
        return
    n = int(lines[0])
    target = int(lines[1])
    arr = [int(x) for x in lines[2:2+n]]
    
    seen = {}
    count = 0
    for num in arr:
        comp = target - num
        if comp in seen:
            count += seen[comp]
        seen[num] = seen.get(num, 0) + 1
    print(count)

if __name__ == '__main__':
    solve()`,
          javascript: `const fs = require('fs');
const tokens = fs.readFileSync(0, 'utf-8').trim().split(/\\s+/);
if (tokens.length >= 2) {
  const n = parseInt(tokens[0], 10);
  const target = parseInt(tokens[1], 10);
  const map = new Map();
  let count = 0;
  for (let i = 0; i < n; i++) {
    const val = parseInt(tokens[2 + i], 10);
    const complement = target - val;
    if (map.has(complement)) {
      count += map.get(complement);
    }
    map.set(val, (map.get(val) || 0) + 1);
  }
  console.log(count);
}`,
          cpp: `#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    int n;
    long long target;
    if (cin >> n >> target) {
        unordered_map<long long, int> freq;
        long long count = 0;
        for (int i = 0; i < n; ++i) {
            long long val;
            cin >> val;
            count += freq[target - val];
            freq[val]++;
        }
        cout << count << "\\n";
    }
    return 0;
}`,
          java: `import java.util.Scanner;
import java.util.HashMap;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextInt()) {
            int n = sc.nextInt();
            long target = sc.nextLong();
            HashMap<Long, Integer> map = new HashMap<>();
            long count = 0;
            for (int i = 0; i < n; i++) {
                long val = sc.nextLong();
                long comp = target - val;
                count += map.getOrDefault(comp, 0);
                map.put(val, map.getOrDefault(val, 0) + 1);
            }
            System.out.println(count);
        }
    }
}`
        },
        sampleTestCases: [
          { input: '4 7\n1 6 3 4', output: '2', explanation: 'Pairs: (1, 6) and (3, 4) sum to 7' },
          { input: '5 10\n5 5 5 5 5', output: '10', explanation: '5 * 4 / 2 = 10 pairs' }
        ],
        hiddenTestCases: [
          { input: '3 0\n0 0 0', output: '3' },
          { input: '4 10\n1 2 3 4', output: '0' },
          { input: '6 8\n2 6 2 6 4 4', output: '5' }
        ]
      }
    ]
  });

  console.log('Sample competition seeded successfully! ID:', comp._id);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
