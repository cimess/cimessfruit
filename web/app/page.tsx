import Link from "next/link";
import Image from "next/image";
import StoreShell from "./store/store-shell";
import Catalogue from "./store/catalogue";
export default function Home() {
  return (
    <StoreShell>
      <section className="store-hero">
        <div className="store-hero-copy">
          <span className="hero-tag">GOOD FOOD. GOOD MOOD.</span>
          <h1>
            A little fresher.
            <br />A lot <em>happier.</em>
          </h1>
          <p>
            From crisp apples to your favourite smoothie.
            <br />
            Bring a little natural goodness to your day.
          </p>
          <Link href="/shop" className="button button-primary">
            Find your fresh →
          </Link>
          <div className="hero-footnote">
            <span>✳</span> Fruit, plantain and smoothies. All in one place.
          </div>
        </div>
        <div className="store-hero-art">
          <div className="hero-art-circle" />
          <Image
            className="hero-pineapple"
            src="/store/pineapple.webp"
            alt="Fresh pineapple"
            width={470}
            height={470}
            priority
          />
          <Image
            className="hero-apple"
            src="/store/redApple.webp"
            alt="Red apples"
            width={230}
            height={230}
            priority
          />
          <span className="hero-sticker">
            100%
            <br />
            <small>FEEL-GOOD FOOD</small>
          </span>
          <span className="hero-art-note">Fresh looks good on you.</span>
        </div>
      </section>
      <section className="store-values">
        <span>
          ✳ <strong>A fresh selection</strong>
        </span>
        <span>
          ◒ <strong>Sizes for every appetite</strong>
        </span>
        <span>
          ♡ <strong>One account, web & mobile</strong>
        </span>
      </section>
      <section className="store-section">
        <div className="store-section-heading">
          <div>
            <p className="eyebrow">PICK YOUR KIND OF GOODNESS</p>
            <h2>What are you craving?</h2>
          </div>
          <span className="muted">A little something for every day.</span>
        </div>
        <div className="store-category-grid">
          {[
            ["FRUIT", "Fresh fruit", "Colourful bites of goodness", "redApple"],
            ["PLANTAIN", "Plantain", "Your kitchen’s favourite", "plantain"],
            ["SMOOTHIE", "Smoothies", "Sip on something good", "smoothie2"],
          ].map(([category, title, description, image]) => (
            <Link
              key={category}
              href={`/shop?category=${category}`}
              className={`store-category category-${category.toLowerCase()}`}
            >
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
                <span>Explore →</span>
              </div>
              <Image
                src={`/store/${image}.webp`}
                alt={title}
                width={220}
                height={220}
              />
            </Link>
          ))}
        </div>
      </section>
      <section className="store-section">
        <div className="store-section-heading">
          <div>
            <p className="eyebrow">STRAIGHT FROM OUR COLLECTION</p>
            <h2>Fresh finds, just for you.</h2>
          </div>
          <Link href="/shop" className="text-link">
            Shop everything ↗
          </Link>
        </div>
        <Catalogue featured />
      </section>
      <section className="store-story">
        <Image
          src="/store/delivery.webp"
          alt="Fresh fruit delivery"
          width={360}
          height={300}
        />
        <div>
          <p className="eyebrow">FRESH TO YOUR DOOR</p>
          <h2>
            Your favourites,
            <br />
            delivered fresh.
          </h2>
          <p>
            View the latest stock photos before adding your favourites to your
            bag.
          </p>
          <Link href="/shop" className="button button-primary">
            Browse fresh fruit →
          </Link>
        </div>
      </section>
      <section className="store-story">
        <div>
          <p className="eyebrow">YOUR DAILY DOSE OF GOOD</p>
          <h2>
            Make room for
            <br />
            <em>the good stuff.</em>
          </h2>
          <p>
            A breakfast worth waking up for. A brighter lunch break. A simple,
            fresh snack. Find your everyday favourites at CimessFruit.
          </p>
          <Link href="/signup" className="button button-primary">
            Join the fresh side →
          </Link>
        </div>
        <Image
          src="/store/grapes.webp"
          alt="A bunch of grapes"
          width={420}
          height={360}
        />
      </section>
    </StoreShell>
  );
}
