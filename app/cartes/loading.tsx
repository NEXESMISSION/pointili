/**
 * The wallet, while it is being fetched.
 *
 * /cartes is the one screen a returning customer opens cold — it is what the
 * installed icon points at — so it is the navigation most often made on a bad
 * connection, from a standing start, with nothing cached. It also has no parent
 * loading boundary: /[slug]/loading.tsx covers the shop app, and this route
 * sits outside it.
 *
 * Its own shape rather than the shop one: a title, then one card per shop the
 * customer holds. Two cards, because that is what a wallet worth opening looks
 * like, and a skeleton that promises one would jump when the second lands.
 */
export default function Loading() {
  return (
    <div className="sk-page mx-auto w-full max-w-[560px] px-5 pb-10 pt-6" aria-hidden>
      <div className="sk h-[22px] w-[46%] rounded-[9px]" />
      <div className="mt-5 space-y-4">
        {[0, 1].map((i) => (
          <div
            key={i}
            className="sk h-[132px] w-full rounded-[22px]"
            style={{ ["--sk-delay" as string]: `${i * 110}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
