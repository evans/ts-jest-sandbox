import { ApolloClient } from 'apollo-client';
import AC from 'apollo-boost';
import { InMemoryCache } from 'apollo-cache-inmemory';
import { ApolloLink, Observable, Operation, FetchResult } from 'apollo-link';
import gql from 'graphql-tag';
import { ApolloProvider, Query } from 'react-apollo';
import React from 'react';
import ReactDOM from 'react-dom';
import { mockSingleLink, MockLink } from '../__mocks__/mockLinks';
import { DocumentNode } from 'graphql';
import { inspect } from 'util';
import { create } from 'react-test-renderer';

const query = gql`
  query Q($skip: Int = 0) {
    books(skip: $skip, limit: 2) @connection(key: "abc") {
      name
    }
  }
`;

const transformedQuery: DocumentNode = gql`
  query Q($skip: Int = 0) {
    books(skip: $skip, limit: 2) {
      name
      __typename
    }
  }
`;

const firstResult = {
  books: [
    {
      name: 'first',
      __typename: 'Book',
    },
  ],
};

const secondResult = {
  books: [
    {
      name: 'second',
      __typename: 'Book',
    },
  ],
};

const thirdResult = {
  books: [
    {
      name: 'skip:2',
      __typename: 'Book',
    },
  ],
};

const link = mockSingleLink() as MockLink;

const ssrFirstResult = {
  books: [
    {
      name: 'ssrfirst',
      __typename: 'Book',
    },
  ],
};

const ssrSecondResult = {
  books: [
    {
      name: 'ssrSecond',
      __typename: 'Book',
    },
  ],
};

const ssrLink: MockLink = mockSingleLink() as MockLink;

describe('tests', () => {
  beforeEach(() => {
    ssrLink.clearMockedResponse();
    ssrLink.addMockedResponses(
      {
        request: { query: transformedQuery, variables: { skip: 0 } } as any,
        result: { data: ssrFirstResult },
      },
      {
        request: { query: transformedQuery } as any,
        result: { data: ssrSecondResult },
      },
    );
    link.clearMockedResponse();
    link.addMockedResponses(
      {
        request: { query: transformedQuery } as any,
        result: { data: firstResult },
      },
      {
        request: { query: transformedQuery } as any,
        result: { data: secondResult },
      },
      {
        request: { query: transformedQuery } as any,
        result: { data: thirdResult },
      },
      {
        request: { query: transformedQuery, variables: { skip: 0 } } as any,
        result: { data: firstResult },
      },
      {
        request: { query: transformedQuery, variables: { skip: 0 } } as any,
        result: { data: secondResult },
      },
      {
        request: { query: transformedQuery, variables: { skip: 2 } } as any,
        result: { data: thirdResult },
      },
    );
  });

  test('apollo client with refetch', async done => {
    const ssrClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: ssrLink,
    });
    await Promise.all([
      ssrClient.query({
        query,
        variables: {},
      }),
    ]);
    const client = new ApolloClient({
      cache: new InMemoryCache().restore(ssrClient.extract()), // --- this is the "SSR" bit
      link,
    });

    const observableQuery = client.watchQuery({ query });

    let count = 0;
    observableQuery.subscribe(
      (data: any) => {
        try {
          if (data.loading) return;

          switch (count) {
            case 0:
              console.log('next0', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('ssrfirst');
              //first refetch
              observableQuery
                .refetch()
                .then((data: any) => {
                  console.log('refetch1', inspect(data, false, null));
                  expect(data.data.books[0].name).toEqual('first');
                })
                .then(() => {
                  //second refetch with different variables
                  observableQuery
                    .refetch({ skip: 2 })
                    .then((data: any) => {
                      console.log('refetch2', inspect(data, false, null));
                      expect(data.data.books[0].name).toEqual('skip:2');
                      done();
                    })
                    .catch(done.fail);
                })
                .catch(done.fail);
              break;
            case 1:
              //first refetch
              console.log('next1', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('first');
              break;
            case 2:
              //second refetch
              console.log('next2', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('skip:2');
              break;
            default:
              done.fail('should not have received more results');
          }
          count++;
        } catch (e) {
          done.fail(e);
        }
      },
      e => done.fail(`observable error should not have been called ${e}`),
      () => done.fail('observable complete should not have been called'),
    );
  });

  test.only('apollo client with setOptions no connection', async done => {
    const ssrClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: ssrLink,
    });
    await Promise.all([
      ssrClient.query({
        query: transformedQuery,
        variables: {},
      }),
    ]);
    const client = new ApolloClient({
      cache: new InMemoryCache().restore(ssrClient.extract()), // --- this is the "SSR" bit
      link,
    });

    const observableQuery = client.watchQuery({ query: transformedQuery });

    let count = 0;
    observableQuery.subscribe(
      (data: any) => {
        try {
          if (data.loading) return;

          switch (count) {
            case 0:
              console.log('next0', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('ssrfirst');
              //first setOptions, should have no change
              observableQuery
                .setOptions({
                  query: transformedQuery,
                  variables: { skip: 0 },
                })
                .then((data: any) => {
                  console.log('setOptions1', inspect(data, false, null));
                  expect(data.data.books[0].name).toEqual('ssrfirst');
                })
                .then((data: any) => {
                  observableQuery
                    .refetch()
                    .then(data => {
                      console.log('refetch1', inspect(data, false, null));
                      expect(data.data.books[0].name).toEqual('first');
                    })
                    .catch(done.fail);
                })
                .catch(done.fail);
              break;
            case 1:
              //first refetch
              console.log('next1', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('first');
              observableQuery
                .setOptions({
                  query: transformedQuery,
                  variables: { skip: 2 },
                })
                .then((data: any) => {
                  console.log('refetch2', inspect(data, false, null));
                  expect(data.data.books[0].name).toEqual('skip:2');
                  done();
                })
                .catch(done.fail);
              break;
            case 2:
              //second refetch
              console.log('next2', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('skip:2');
              break;
            default:
              done.fail('should not have received more results');
          }
          count++;
        } catch (e) {
          done.fail(e);
        }
      },
      e => done.fail(`observable error should not have been called ${e}`),
      () => done.fail('observable complete should not have been called'),
    );
  });

  test.only('apollo client with setOptions with connection', async done => {
    const ssrClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: ssrLink,
    });
    await Promise.all([
      ssrClient.query({
        query,
        variables: {},
      }),
    ]);
    const client = new ApolloClient({
      cache: new InMemoryCache().restore(ssrClient.extract()), // --- this is the "SSR" bit
      link,
    });

    const observableQuery = client.watchQuery({ query });

    let count = 0;
    observableQuery.subscribe(
      (data: any) => {
        try {
          if (data.loading) return;

          switch (count) {
            case 0:
              console.log('next0', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('ssrfirst');
              //first setOptions, should have no change
              observableQuery
                .setOptions({
                  query,
                  variables: { skip: 0 },
                })
                .then((data: any) => {
                  console.log('setOptions1', inspect(data, false, null));
                  expect(data.data.books[0].name).toEqual('ssrfirst');
                })
                .then((data: any) => {
                  observableQuery
                    .refetch()
                    .then(data => {
                      console.log('refetch1', inspect(data, false, null));
                      expect(data.data.books[0].name).toEqual('first');
                    })
                    .catch(done.fail);
                })
                .catch(done.fail);
              break;
            case 1:
              //first refetch
              console.log('next1', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('first');
              observableQuery
                .setOptions({
                  query,
                  variables: { skip: 2 },
                })
                .then((data: any) => {
                  console.log('refetch2', inspect(data, false, null));
                  expect(data.data.books[0].name).toEqual('skip:2');
                  done();
                })
                .catch(done.fail);
              break;
            case 2:
              //second refetch
              console.log('next2', inspect(data, false, null));
              expect(data.data.books[0].name).toEqual('skip:2');
              break;
            default:
              done.fail('should not have received more results');
          }
          count++;
        } catch (e) {
          done.fail(e);
        }
      },
      e => done.fail(`observable error should not have been called ${e}`),
      () => done.fail('observable complete should not have been called'),
    );
  });

  test('react-apollo ssr', async done => {
    const ssrClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: ssrLink,
    });
    await Promise.all([
      ssrClient.query({
        query,
        variables: {},
      }),
    ]);
    const client = new ApolloClient({
      cache: new InMemoryCache().restore(ssrClient.extract()), // --- this is the "SSR" bit
      link,
    });

    //try to render the app / call refetch / etc

    let refetched = false;
    let refetched2 = false;
    const ApolloApp = (
      <ApolloProvider client={client}>
        <Query query={query} fetchPolicy="cache-first">
          {({ loading, data, error, refetch }) => {
            if (loading) {
              return <div>loading</div>;
            }

            try {
              if (!refetched) {
                expect(data.books[0].name).toEqual('ssrfirst');
                refetch()
                  .then(data => {
                    console.log('refetch1', inspect(data, false, null));
                    expect(data.data.books[0].name).toEqual('first');
                  })
                  .catch(done.fail);
                refetched = true;
              } else if (refetched2) {
                expect(data.books[0].name).toEqual('skip:2');
              } else {
                expect(data.books[0].name).toEqual('first');

                //call refetch
                refetch({ skip: 2 })
                  .then(data => {
                    console.log('refetch2', inspect(data, false, null));
                    expect(data.data.books[0].name).toEqual('skip:2');
                    done();
                  })
                  .catch(done.fail);
                refetched2 = true;
              }
            } catch (e) {
              done.fail(e);
            }
            return <p> stub </p>;
          }}
        </Query>
      </ApolloProvider>
    );

    const result = create(ApolloApp);
    console.log(result.toJSON());
    /**/
  });

  test('react-apollo without connection', async done => {
    const ssrClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: ssrLink,
    });
    await ssrClient.query({
      query: transformedQuery,
      variables: {},
    });

    const client = new ApolloClient({
      cache: new InMemoryCache().restore(ssrClient.extract()), // --- this is the "SSR" bit
      link,
    });

    //try to render the app / call refetch / etc

    let refetched = false;
    let skip = 0;
    const Container = class Contain extends React.Component {
      render() {
        return (
          <Query query={transformedQuery} variables={{ skip: this.props.skip }}>
            {({ loading, data, error, refetch }) => {
              if (loading) {
                console.log('loading');
                return <div>loading</div>;
              }

              console.log('props', inspect(this.props, false, null));

              try {
                if (!refetched) {
                  console.log('refetch', inspect(data, false, null));
                  expect(data.books[0].name).toEqual('ssrfirst');
                  // refetch()
                  //   .then(data => {
                  //     console.log('refetch', inspect(data, false, null));
                  //     expect(data.data.books[0].name).toEqual('first');
                  //     done();
                  //   })
                  //   .catch(done.fail);
                  refetched = true;
                } else {
                  console.log('first', inspect(data, false, null));
                  expect(data.books[0].name).toEqual('skip:2');
                  done();
                }
              } catch (e) {
                done.fail(e);
              }
              return <p> {this.props.skip} </p>;
            }}
          </Query>
        );
      }
    };

    const ApolloApp = (
      <ApolloProvider client={client}>
        <Container skip={skip} />
      </ApolloProvider>
    );

    create(ApolloApp);

    //props updated, often caused by url change
    skip = 2;
    create(
      <ApolloProvider client={client}>
        <Container skip={skip} />
      </ApolloProvider>,
    );

    /**/
  });

  test('react-apollo with connection', async done => {
    const ssrClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: ssrLink,
    });
    await ssrClient.query({
      query,
      variables: {},
    });

    const client = new ApolloClient({
      cache: new InMemoryCache().restore(ssrClient.extract()), // --- this is the "SSR" bit
      link,
    });

    //try to render the app / call refetch / etc

    let refetched = false;
    let skip = 0;
    const Container = class Contain extends React.Component {
      render() {
        return (
          <Query query={query} variables={{ skip: this.props.skip }}>
            {({ loading, data, error, refetch }) => {
              if (loading) {
                console.log('loading');
                return <div>loading</div>;
              }

              console.log('props', inspect(this.props, false, null));

              try {
                if (!refetched) {
                  console.log('refetch', inspect(data, false, null));
                  expect(data.books[0].name).toEqual('ssrfirst');
                  // refetch()
                  //   .then(data => {
                  //     console.log('refetch', inspect(data, false, null));
                  //     expect(data.data.books[0].name).toEqual('first');
                  //     done();
                  //   })
                  //   .catch(done.fail);
                  refetched = true;
                } else {
                  console.log('first', inspect(data, false, null));
                  expect(data.books[0].name).toEqual('skip:2');
                }
              } catch (e) {
                done.fail(e);
              }
              return <p> {this.props.skip} </p>;
            }}
          </Query>
        );
      }
    };

    const ApolloApp = (
      <ApolloProvider client={client}>
        <Container skip={skip} />
      </ApolloProvider>
    );

    create(ApolloApp);

    //props updated, often caused by url change
    skip = 2;
    create(
      <ApolloProvider client={client}>
        <Container skip={skip} />
      </ApolloProvider>,
    );

    /**/
  });

  test('simple ssr refetch', async () => {
    const ssrClient = new ApolloClient({
      cache: new InMemoryCache(),
      link: ssrLink,
    });
    await Promise.all([
      ssrClient.query({
        query,
        variables: {},
      }),
      ssrClient.query({
        query,
        variables: {},
      }),
    ]);
    const client = new ApolloClient({
      cache: new InMemoryCache().restore(ssrClient.extract()), // --- this is the "SSR" bit
      link,
    });

    const observableQuery = client.watchQuery({ query });

    let seen = false;
    observableQuery.subscribe(
      data => {
        console.log('next', inspect(data, false, null));
        if (!seen) {
          console.log('calling refetch');
          observableQuery
            .refetch()
            .then(data => {
              console.log('refetch', inspect(data, false, null));
            })
            .then(() => {
              observableQuery.refetch().then(data => {
                console.log('refetch2', inspect(data, false, null));
              });
            });
          seen = true;
        }
      },
      console.error,
      () => console.log('complete'),
    );

    // client.query({ query });

    //try to render the app / call refetch / etc

    /*
    const ApolloApp = (AppComponent: any) => (
      <ApolloProvider client={client}>
        <Query query={query}>
          {({ loading, data, error }) => {
            if (loading) {
              return <p> loading</p>;
            }

            console.log(data);
          }}
        </Query>
      </ApolloProvider>
    );
    /**/
  });
});
