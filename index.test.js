const core = require('@actions/core');
const github = require('@actions/github');

jest.mock('@actions/core');
jest.mock('@actions/github');

// Re-require index.js for each test to reset module state
function runAction() {
  // Clear the module cache so run() executes fresh
  jest.resetModules();
  jest.mock('@actions/core');
  jest.mock('@actions/github');

  const coreMock = require('@actions/core');
  const githubMock = require('@actions/github');

  return { coreMock, githubMock };
}

function setupMocks({ inputs = {}, payload = {} } = {}) {
  const coreMock = require('@actions/core');
  const githubMock = require('@actions/github');

  const defaultPayload = {
    pull_request: {
      number: 1,
      title: 'My PR Title',
      body: 'My PR Body',
      base: { ref: 'main' },
      head: { ref: 'feature/foo-123-add-thing' },
    },
    ...payload,
  };

  const defaultInputs = {
    'repo-token': 'fake-token',
    'base-branch-regex': '',
    'head-branch-regex': '',
    'lowercase-branch': 'true',
    'title-template': '',
    'title-update-action': 'prefix',
    'title-insert-space': 'true',
    'title-uppercase-base-match': 'true',
    'title-uppercase-head-match': 'true',
    'body-template': '',
    'body-update-action': 'prefix',
    'body-newline-count': '2',
    'body-uppercase-base-match': 'true',
    'body-uppercase-head-match': 'true',
    ...inputs,
  };

  coreMock.getInput.mockImplementation((name) => defaultInputs[name] || '');

  const mockUpdate = jest.fn().mockResolvedValue({ status: 200 });
  const mockOctokit = { rest: { pulls: { update: mockUpdate } } };
  githubMock.getOctokit.mockReturnValue(mockOctokit);

  githubMock.context = {
    payload: defaultPayload,
    repo: { owner: 'test-owner', repo: 'test-repo' },
  };

  return { coreMock, githubMock, mockUpdate };
}

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
});

describe('pr-update-action', () => {
  test('fails when no branch regex is specified', async () => {
    const { coreMock } = setupMocks();
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setFailed).toHaveBeenCalledWith('No branch regex values have been specified');
  });

  test('fails on non-pull_request event', async () => {
    const { coreMock } = setupMocks({
      inputs: { 'head-branch-regex': 'foo-\\d+' },
      payload: { pull_request: undefined },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setFailed).toHaveBeenCalledWith('This action only works on pull_request events');
  });

  test('fails when head branch does not match regex', async () => {
    const { coreMock } = setupMocks({
      inputs: { 'head-branch-regex': 'bar-\\d+' },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setFailed).toHaveBeenCalledWith('Head branch name does not match given regex');
  });

  test('fails when base branch does not match regex', async () => {
    const { coreMock } = setupMocks({
      inputs: { 'base-branch-regex': 'release-\\d+' },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setFailed).toHaveBeenCalledWith('Base branch name does not match given regex');
  });

  test('fails on invalid regex', async () => {
    const { coreMock } = setupMocks({
      inputs: { 'head-branch-regex': '[invalid' },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setFailed).toHaveBeenCalledWith("Invalid head-branch-regex: '[invalid'");
  });

  test('fails on invalid title-update-action', async () => {
    const { coreMock } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'title-update-action': 'prepend',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid title-update-action: 'prepend'")
    );
  });

  test('fails on invalid body-update-action', async () => {
    const { coreMock } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'body-update-action': 'append',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setFailed).toHaveBeenCalledWith(
      expect.stringContaining("Invalid body-update-action: 'append'")
    );
  });

  test('prefixes title with matched head branch text', async () => {
    const { coreMock, mockUpdate } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'title-template': '[%headbranch%]',
        'title-update-action': 'prefix',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '[FOO-123] My PR Title',
      })
    );
    expect(coreMock.setOutput).toHaveBeenCalledWith('titleUpdated', 'true');
  });

  test('suffixes title with matched head branch text', async () => {
    const { mockUpdate } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'title-template': '[%headbranch%]',
        'title-update-action': 'suffix',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'My PR Title [FOO-123]',
      })
    );
  });

  test('replaces title with matched head branch text', async () => {
    const { mockUpdate } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'title-template': '%headbranch%: New Title',
        'title-update-action': 'replace',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'FOO-123: New Title',
      })
    );
  });

  test('prefixes body with matched text and newlines', async () => {
    const { mockUpdate } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'body-template': 'Ticket: %headbranch%',
        'body-update-action': 'prefix',
        'body-newline-count': '2',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Ticket: FOO-123\n\nMy PR Body',
      })
    );
  });

  test('does not update when title already has prefix', async () => {
    const { coreMock, mockUpdate } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'title-template': '[%headbranch%]',
        'title-update-action': 'prefix',
      },
      payload: {
        pull_request: {
          number: 1,
          title: '[FOO-123] My PR Title',
          body: '',
          base: { ref: 'main' },
          head: { ref: 'feature/foo-123-add-thing' },
        },
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setOutput).toHaveBeenCalledWith('titleUpdated', 'false');
  });

  test('skips update when template is empty (no replace with empty string)', async () => {
    const { coreMock, mockUpdate } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'title-template': '',
        'title-update-action': 'replace',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    // Should not call update since both title and body templates are empty
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('handles NaN body-newline-count by defaulting to 2', async () => {
    const { mockUpdate } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'body-template': 'Info: %headbranch%',
        'body-update-action': 'prefix',
        'body-newline-count': 'not-a-number',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Info: FOO-123\n\nMy PR Body',
      })
    );
  });

  test('sets outputs for matched branches', async () => {
    const { coreMock } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'base-branch-regex': 'main',
        'title-template': '[%headbranch%]',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setOutput).toHaveBeenCalledWith('headMatch', 'foo-123');
    expect(coreMock.setOutput).toHaveBeenCalledWith('baseMatch', 'main');
  });

  test('respects lowercase-branch=false', async () => {
    const { coreMock } = setupMocks({
      inputs: {
        'head-branch-regex': 'FOO-\\d+',
        'lowercase-branch': 'false',
      },
      payload: {
        pull_request: {
          number: 1,
          title: 'Title',
          body: '',
          base: { ref: 'main' },
          head: { ref: 'feature/FOO-123-thing' },
        },
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(coreMock.setOutput).toHaveBeenCalledWith('headMatch', 'FOO-123');
  });

  test('respects uppercase-head-match=false', async () => {
    const { mockUpdate } = setupMocks({
      inputs: {
        'head-branch-regex': 'foo-\\d+',
        'title-template': '[%headbranch%]',
        'title-update-action': 'prefix',
        'title-uppercase-head-match': 'false',
      },
    });
    require('./index');
    await new Promise(process.nextTick);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '[foo-123] My PR Title',
      })
    );
  });
});
