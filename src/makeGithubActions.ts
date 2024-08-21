import { Octokit } from '@octokit/core';
import crypto from 'crypto';

function sha1(url: string): string {
	const hash = crypto.createHash('sha1');
	hash.update(url);
	return hash.digest('hex');
}

async function fetchGithubDiscussionsUnderATopic(repoOwner: string, repoName: string, octokit: Octokit, topicId: string, cursor: string | null = null) {
	const response = await octokit.graphql(`
		query($topicId: ID!, $repoOwner: String!, $repoName: String!, $offset: String = null) {
			repository(owner: $repoOwner, name: $repoName) {
			    id
				discussions (after: $offset, first: 100, categoryId: $topicId) {
					pageInfo {
						hasNextPage,
						endCursor
					}
					nodes {
						id
						title
						body
						url
						closed
						locked
					}
				}
			}
		}
	`, {
		repoOwner,
		repoName,
		topicId,
		offset: cursor
	}) as { repository: {
		id: string,
		discussions: {
			nodes: {
				id: string,
				title: string,
				body: string,
				url: string,
				closed: boolean
				locked: boolean
			}[],
			pageInfo: {
				hasNextPage: boolean,
				endCursor: string,
			}
		}
	}};

	return [response.repository.id, response.repository.discussions] as const;
}

async function fetchAllGithubDiscussionsUnderATopic(repoOwner: string, repoName: string, octokit: Octokit, topicId: string) {
	let discussions: {
		id: string,
		title: string,
		body: string,
		url: string,
		locked: boolean
		closed: boolean
	}[] | null = null;
	let repositoryId: string;
	let cursor: string | null = null;
	do {
		const data = await fetchGithubDiscussionsUnderATopic(repoOwner, repoName, octokit, topicId, cursor);
		if (discussions)
			discussions.push(...data[1].nodes);
		else
			discussions = data[1].nodes;
		cursor = data[1].pageInfo.endCursor;
		repositoryId = data[0];
	} while (cursor);
	return [repositoryId, discussions] as const;
}
interface RequestedPost {
	url: string,
	status: 'open' | 'closed' | 'disabled',
	title: string
}

export default async function makeGithubActions(octokit: Octokit, repoOwner: string, repoName: string, categoryId: string, websiteBase: string, json: RequestedPost[]) {
	const [repositoryId, data] = await fetchAllGithubDiscussionsUnderATopic(repoOwner, repoName, octokit, categoryId);
	const promises: Promise<unknown>[] = [];

	const remainingPosts = json.map(post => ({
		...post,
		hash: sha1(post.url),
		body: `<!-- sha1: ${sha1(post.url)} -->\nDiscussion for ${websiteBase}${post.url}`
	}));

	for (const existingPost of data) {
		const existingHash = existingPost.body.match(/<!-- sha1: ([0-9a-f]{40}) -->/);
		if (!existingHash) continue;

		const index = remainingPosts.findIndex(post => post.hash === existingHash[1]);
		if (index === -1) {
			if (existingPost.locked || existingPost.closed) continue;
			console.log(`Locking ${existingPost.url} for OUTDATED`);
			promises.push(octokit.graphql(`
				mutation($id: ID!) {
					closeDiscussion(input: { discussionId: $id, reason: OUTDATED }) {
						clientMutationId
					}
				}
			`, {
				id: existingPost.id
			}));
		} else {
			const post = remainingPosts[index];
			remainingPosts.splice(index, 1);

			if (existingPost.locked) continue;
			if (post.title !== existingPost.title || post.body !== existingPost.body) {
				console.log(`Updating title of ${post.url}`);
				promises.push(octokit.graphql(`
					mutation($id: ID!, $title: String!, $body: String!) {
						updateDiscussion(input: { discussionId: $id, title: $title, body: $body }) {
							clientMutationId
						}
					}
				`, {
					id: existingPost.id,
					title: post.title,
					body: post.body
				}));
			}
			if ((post.status === 'closed' || post.status === 'disabled') && !existingPost.closed) {
				console.log(`Locking ${post.url} for RESOLVED`);
				promises.push(octokit.graphql(`
					mutation($id: ID!) {
						closeDiscussion(input: { discussionId: $id, reason: RESOLVED }) {
							clientMutationId
						}
					}
				`, {
					id: existingPost.id
				}));
			} else if (post.status === 'open' && existingPost.closed) {
				console.log(`Re-opening ${post.url}`);
				promises.push(octokit.graphql(`
					mutation($id: ID!) {
						reopenDiscussion(input: { discussionId: $id }) {
							clientMutationId
						}
					}
				`, {
					id: existingPost.id
				}));
			}
		}
	}
	for (const post of remainingPosts) {
		console.log(`Creating ${post.url}`);
		promises.push(octokit.graphql(`
			mutation($repositoryId: ID!, $title: String!, $body: String!, $categoryId: ID!) {
				createDiscussion(input: { repositoryId: $repoId, categoryId: $categoryId, title: $title, body: $body }) {
					clientMutationId
				}
			}
		`, {
			repositoryId,
			categoryId,
			title: post.title,
			body: `<!-- sha1: ${post.hash} -->\nDiscussion for ${websiteBase}${post.url}`
		}));
	}

	await Promise.all(promises);
}
